import { db } from '@quadbot/db';
import {
  campaignLeads,
  campaigns,
  campaignSequenceSteps,
  leads,
  outreachAccounts,
  outreachEmails,
  outreachConversations,
  outreachMessages,
} from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';
import { EventType } from '@quadbot/shared';
import { emitEvent } from '../event-emitter.js';
import { logger } from '../logger.js';
import type { JobContext } from '../registry.js';
import {
  sendOutreachEmail,
  generateMessageId,
} from '../lib/resend-client.js';
import { renderTemplate, htmlToText } from '../lib/template-renderer.js';

/**
 * Send a single outreach email for a campaign lead.
 * Enqueued by the campaign scheduler with pre-calculated delay.
 */
export async function outreachSendEmailJob(ctx: JobContext): Promise<void> {
  const { brandId, jobId, payload } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'outreach_send_email' }, 'Outreach_Send_Email starting');

  const campaignLeadId = payload.campaign_lead_id as string;
  const delayMs = (payload.delay_ms as number) || 0;

  // 1. Sleep for spacing delay
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 600_000)));
  }

  // 2. Load campaign_lead with related data
  const [cl] = await db
    .select()
    .from(campaignLeads)
    .where(eq(campaignLeads.id, campaignLeadId))
    .limit(1);

  if (!cl) {
    logger.error({ campaignLeadId }, 'Campaign lead not found');
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, cl.campaign_id))
    .limit(1);

  if (!campaign) {
    logger.error({ campaignId: cl.campaign_id }, 'Campaign not found');
    return;
  }

  // 3. Guard checks
  if (campaign.status !== 'active') {
    logger.info({ campaignId: campaign.id }, 'Campaign no longer active, skipping send');
    await db
      .update(campaignLeads)
      .set({ status: 'pending', updated_at: new Date() })
      .where(eq(campaignLeads.id, cl.id));
    return;
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, cl.lead_id))
    .limit(1);

  if (!lead) {
    logger.error({ leadId: cl.lead_id }, 'Lead not found');
    return;
  }

  if (lead.is_bounced || lead.is_unsubscribed) {
    logger.info({ leadId: lead.id }, 'Lead bounced or unsubscribed, skipping');
    await db
      .update(campaignLeads)
      .set({
        status: lead.is_bounced ? 'bounced' : 'unsubscribed',
        updated_at: new Date(),
      })
      .where(eq(campaignLeads.id, cl.id));
    return;
  }

  // 4. Get current step
  const [step] = await db
    .select()
    .from(campaignSequenceSteps)
    .where(
      and(
        eq(campaignSequenceSteps.campaign_id, campaign.id),
        eq(campaignSequenceSteps.step_order, cl.current_step + 1),
      ),
    )
    .limit(1);

  if (!step) {
    // No more steps — mark completed
    await db
      .update(campaignLeads)
      .set({ status: 'completed', completed_at: new Date(), updated_at: new Date() })
      .where(eq(campaignLeads.id, cl.id));
    logger.info({ campaignLeadId: cl.id }, 'All steps completed');
    return;
  }

  // 5. Get outreach account
  const accountId = cl.outreach_account_id || (payload.outreach_account_id as string);
  const [account] = await db
    .select()
    .from(outreachAccounts)
    .where(eq(outreachAccounts.id, accountId))
    .limit(1);

  if (!account || account.status !== 'active') {
    logger.error({ accountId }, 'Outreach account not found or inactive');
    await db
      .update(campaignLeads)
      .set({ status: 'error', pause_reason: 'Sending account unavailable', updated_at: new Date() })
      .where(eq(campaignLeads.id, cl.id));
    return;
  }

  // 6. Render templates
  const subject = renderTemplate(step.subject_template, lead);
  const bodyHtml = renderTemplate(step.body_template, lead);
  const bodyText = htmlToText(bodyHtml);

  // 7. Generate Message-ID and threading headers
  const domain = account.email.split('@')[1];
  const messageId = generateMessageId(domain);
  let inReplyTo: string | undefined;
  let references: string | undefined;

  if (step.is_reply_to_previous && step.step_order > 1) {
    // Find the previous email sent in this sequence
    const [prevEmail] = await db
      .select()
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.campaign_lead_id, cl.id),
          eq(outreachEmails.step_order, step.step_order - 1),
        ),
      )
      .limit(1);

    if (prevEmail?.message_id_header) {
      inReplyTo = prevEmail.message_id_header;
      references = prevEmail.message_id_header;
    }
  }

  // 8. Send via Resend
  const now = new Date();
  let resendMessageId: string;

  try {
    const result = await sendOutreachEmail({
      accountId: account.id,
      encryptedApiKey: account.resend_api_key_encrypted,
      from: { email: account.email, name: account.from_name },
      to: lead.email,
      subject: step.is_reply_to_previous ? `Re: ${subject}` : subject,
      html: bodyHtml,
      text: bodyText,
      messageId,
      inReplyTo,
      references,
    });
    resendMessageId = result.resendMessageId;
  } catch (err) {
    logger.error({ err, campaignLeadId: cl.id }, 'Failed to send outreach email');
    await db
      .update(campaignLeads)
      .set({ status: 'error', pause_reason: (err as Error).message, updated_at: now })
      .where(eq(campaignLeads.id, cl.id));
    return;
  }

  // 9. Insert outreach_emails record
  const [emailRecord] = await db
    .insert(outreachEmails)
    .values({
      brand_id: brandId,
      campaign_id: campaign.id,
      campaign_lead_id: cl.id,
      outreach_account_id: account.id,
      step_order: step.step_order,
      from_email: account.email,
      from_name: account.from_name,
      to_email: lead.email,
      subject: step.is_reply_to_previous ? `Re: ${subject}` : subject,
      body_html: bodyHtml,
      body_text: bodyText,
      resend_message_id: resendMessageId,
      message_id_header: messageId,
      in_reply_to_header: inReplyTo || null,
      status: 'sent',
      sent_at: now,
    })
    .returning();

  // 10. Also track as outbound message in conversation (if exists)
  const [existingConvo] = await db
    .select()
    .from(outreachConversations)
    .where(
      and(
        eq(outreachConversations.campaign_id, campaign.id),
        eq(outreachConversations.lead_id, lead.id),
      ),
    )
    .limit(1);

  if (existingConvo) {
    await db.insert(outreachMessages).values({
      conversation_id: existingConvo.id,
      direction: 'outbound',
      subject: emailRecord.subject,
      body_text: bodyText,
      body_html: bodyHtml,
      outreach_email_id: emailRecord.id,
      from_email: account.email,
    });
    await db
      .update(outreachConversations)
      .set({
        last_message_at: now,
        message_count: sql`${outreachConversations.message_count} + 1`,
        updated_at: now,
      })
      .where(eq(outreachConversations.id, existingConvo.id));
  }

  // 11. Get total steps to determine next action
  const allSteps = await db
    .select()
    .from(campaignSequenceSteps)
    .where(eq(campaignSequenceSteps.campaign_id, campaign.id));

  const maxStep = Math.max(...allSteps.map((s) => s.step_order));
  const nextStepOrder = step.step_order + 1;

  if (nextStepOrder > maxStep) {
    // All steps sent — mark as sent (completed only when replied or fully done)
    await db
      .update(campaignLeads)
      .set({
        current_step: step.step_order,
        status: 'sent',
        last_sent_at: now,
        completed_at: now,
        updated_at: now,
      })
      .where(eq(campaignLeads.id, cl.id));
  } else {
    // Schedule next step
    const nextStep = allSteps.find((s) => s.step_order === nextStepOrder);
    const delayDays = nextStep?.delay_days || 1;
    const nextSendAt = snapToSendWindow(
      new Date(now.getTime() + delayDays * 86400_000),
      campaign,
    );

    await db
      .update(campaignLeads)
      .set({
        current_step: step.step_order,
        status: 'scheduled',
        next_send_at: nextSendAt,
        last_sent_at: now,
        updated_at: now,
      })
      .where(eq(campaignLeads.id, cl.id));
  }

  // 12. Update account counters
  await db
    .update(outreachAccounts)
    .set({
      sent_today: sql`${outreachAccounts.sent_today} + 1`,
      total_sent: sql`${outreachAccounts.total_sent} + 1`,
      last_used_at: now,
      updated_at: now,
    })
    .where(eq(outreachAccounts.id, account.id));

  // 13. Update campaign counters
  await db
    .update(campaigns)
    .set({
      total_sent: sql`${campaigns.total_sent} + 1`,
      updated_at: now,
    })
    .where(eq(campaigns.id, campaign.id));

  // 14. Emit event
  await emitEvent(
    EventType.OUTREACH_EMAIL_SENT,
    brandId,
    {
      outreach_email_id: emailRecord.id,
      campaign_id: campaign.id,
      lead_id: lead.id,
      step_order: step.step_order,
    },
    `outreach-email:${emailRecord.id}`,
    'outreach_send_email',
  );

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'outreach_send_email',
      campaignLeadId: cl.id,
      emailId: emailRecord.id,
      stepOrder: step.step_order,
      to: lead.email,
      durationMs: Date.now() - startTime,
    },
    'Outreach_Send_Email completed',
  );
}

/**
 * Snap a date to the campaign's send window.
 * If the date falls outside the window, push to the start of the next valid send day.
 */
function snapToSendWindow(
  date: Date,
  campaign: { timezone: string; send_window_start: string; send_window_end: string; send_days: unknown },
): Date {
  const sendDays = (campaign.send_days as number[]) || [1, 2, 3, 4, 5];
  const [startH, startM] = campaign.send_window_start.split(':').map(Number);

  // Create a date at the start of the send window on the given date
  // Simple approach: set to send_window_start time
  const result = new Date(date);
  result.setHours(startH, startM, 0, 0);

  // If the result is before the original date, it means we need to check if we're still in window
  // For simplicity, snap to the start of the window on the target day
  // and advance to next valid send day if needed
  let attempts = 0;
  while (attempts < 7) {
    const day = result.getDay();
    if (sendDays.includes(day)) {
      return result;
    }
    result.setDate(result.getDate() + 1);
    attempts++;
  }

  return result;
}
