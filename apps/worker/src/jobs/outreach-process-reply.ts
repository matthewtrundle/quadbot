import { db } from '@quadbot/db';
import {
  outreachEmails,
  outreachConversations,
  outreachMessages,
  campaignLeads,
  campaigns,
  leads,
  jobs,
} from '@quadbot/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { EventType, JobType } from '@quadbot/shared';
import { emitEvent } from '../event-emitter.js';
import { enqueue } from '../queue.js';
import { getRedis } from '../queue.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { randomUUID } from 'node:crypto';
import type { JobContext } from '../registry.js';

/**
 * Process an inbound reply detected via Resend inbound webhook.
 * Matches the reply to an outreach email, creates/updates a conversation,
 * and optionally enqueues an AI reply job.
 */
export async function outreachProcessReply(ctx: JobContext): Promise<void> {
  const { brandId, jobId, payload } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'outreach_process_reply' }, 'Outreach_Process_Reply starting');

  const fromEmail = payload.from_email as string;
  const toEmail = payload.to_email as string;
  const subject = payload.subject as string | undefined;
  const bodyText = payload.body_text as string | undefined;
  const bodyHtml = payload.body_html as string | undefined;
  const inReplyTo = payload.in_reply_to as string | undefined;
  const references = payload.references as string | undefined;
  const resendInboundId = payload.resend_inbound_id as string | undefined;
  const rawHeaders = payload.raw_headers as Record<string, unknown> | undefined;

  const now = new Date();

  // 1. Match reply to an outreach email (priority order)
  let matchedEmail = null;

  // Strategy 1: In-Reply-To header → match to message_id_header
  if (inReplyTo) {
    const [match] = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.message_id_header, inReplyTo))
      .limit(1);
    if (match) matchedEmail = match;
  }

  // Strategy 2: References header → match any value
  if (!matchedEmail && references) {
    const refList = references.split(/\s+/).filter(Boolean);
    for (const ref of refList) {
      const [match] = await db
        .select()
        .from(outreachEmails)
        .where(eq(outreachEmails.message_id_header, ref))
        .limit(1);
      if (match) {
        matchedEmail = match;
        break;
      }
    }
  }

  // Strategy 3: from_email (reply sender) = to_email of original, and to_email = from_email of original
  if (!matchedEmail) {
    const [match] = await db
      .select()
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.to_email, fromEmail),
          eq(outreachEmails.from_email, toEmail),
        ),
      )
      .orderBy(desc(outreachEmails.sent_at))
      .limit(1);
    if (match) matchedEmail = match;
  }

  if (!matchedEmail) {
    logger.warn(
      { fromEmail, toEmail, inReplyTo },
      'Could not match inbound reply to any outreach email — discarding',
    );
    return;
  }

  // 2. Load related data
  const [campaignLead] = await db
    .select()
    .from(campaignLeads)
    .where(eq(campaignLeads.id, matchedEmail.campaign_lead_id))
    .limit(1);

  if (!campaignLead) {
    logger.error({ campaignLeadId: matchedEmail.campaign_lead_id }, 'Campaign lead not found');
    return;
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, campaignLead.lead_id))
    .limit(1);

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, matchedEmail.campaign_id))
    .limit(1);

  // 3. Create or get conversation (upsert on campaign_id + lead_id)
  let conversation;
  const [existingConvo] = await db
    .select()
    .from(outreachConversations)
    .where(
      and(
        eq(outreachConversations.campaign_id, matchedEmail.campaign_id),
        eq(outreachConversations.lead_id, campaignLead.lead_id),
      ),
    )
    .limit(1);

  if (existingConvo) {
    conversation = existingConvo;
  } else {
    const [newConvo] = await db
      .insert(outreachConversations)
      .values({
        brand_id: matchedEmail.brand_id,
        campaign_id: matchedEmail.campaign_id,
        lead_id: campaignLead.lead_id,
        campaign_lead_id: campaignLead.id,
        status: 'active',
        last_message_at: now,
        message_count: 0,
      })
      .returning();
    conversation = newConvo;
  }

  // 4. Insert inbound message
  await db.insert(outreachMessages).values({
    conversation_id: conversation.id,
    direction: 'inbound',
    subject: subject || null,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    from_email: fromEmail,
    resend_inbound_id: resendInboundId || null,
    raw_headers: rawHeaders || null,
  });

  // 5. Update conversation
  await db
    .update(outreachConversations)
    .set({
      last_message_at: now,
      message_count: sql`${outreachConversations.message_count} + 1`,
      status: 'active',
      updated_at: now,
    })
    .where(eq(outreachConversations.id, conversation.id));

  // 6. Update campaign_lead status to replied, clear next_send_at
  await db
    .update(campaignLeads)
    .set({
      status: 'replied',
      next_send_at: null,
      updated_at: now,
    })
    .where(eq(campaignLeads.id, campaignLead.id));

  // 7. Emit reply received event
  await emitEvent(
    EventType.OUTREACH_REPLY_RECEIVED,
    matchedEmail.brand_id,
    {
      conversation_id: conversation.id,
      campaign_id: matchedEmail.campaign_id,
      lead_id: campaignLead.lead_id,
      from_email: fromEmail,
    },
    `outreach-reply:${conversation.id}:${now.getTime()}`,
    'outreach_process_reply',
  );

  // 8. Check campaign reply mode → enqueue AI reply if configured
  if (campaign && (campaign.reply_mode === 'ai_draft_approve' || campaign.reply_mode === 'ai_auto_reply')) {
    const redis = getRedis(config.REDIS_URL);
    const jobId = randomUUID();

    await db.insert(jobs).values({
      id: jobId,
      brand_id: matchedEmail.brand_id,
      type: JobType.OUTREACH_AI_REPLY,
      status: 'queued',
      payload: {
        conversation_id: conversation.id,
        campaign_id: campaign.id,
        reply_mode: campaign.reply_mode,
      },
    });

    await enqueue(redis, {
      jobId,
      type: JobType.OUTREACH_AI_REPLY,
      payload: {
        brand_id: matchedEmail.brand_id,
        conversation_id: conversation.id,
        campaign_id: campaign.id,
        reply_mode: campaign.reply_mode,
      },
    });

    // Mark AI draft pending
    await db
      .update(outreachConversations)
      .set({ ai_draft_pending: true, updated_at: now })
      .where(eq(outreachConversations.id, conversation.id));

    logger.info({ conversationId: conversation.id, replyMode: campaign.reply_mode }, 'AI reply job enqueued');
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'outreach_process_reply',
      conversationId: conversation.id,
      fromEmail,
      campaignId: matchedEmail.campaign_id,
      leadEmail: lead?.email,
      durationMs: Date.now() - startTime,
    },
    'Outreach_Process_Reply completed',
  );
}
