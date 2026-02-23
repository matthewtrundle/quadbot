import { db } from '@quadbot/db';
import {
  outreachConversations,
  outreachMessages,
  outreachEmails,
  campaignLeads,
  campaigns,
  leads,
  outreachAccounts,
} from '@quadbot/db';
import { eq, and, sql, asc } from 'drizzle-orm';
import { EventType } from '@quadbot/shared';
import { outreachAiReplyOutputSchema } from '@quadbot/shared';
import { emitEvent } from '../event-emitter.js';
import { logger } from '../logger.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import {
  sendOutreachEmail,
  generateMessageId,
} from '../lib/resend-client.js';
import type { JobContext } from '../registry.js';

/**
 * Generate an AI reply for an outreach conversation.
 * If reply_mode is 'ai_auto_reply', sends immediately.
 * If reply_mode is 'ai_draft_approve', creates a draft for user review.
 */
export async function outreachAiReply(ctx: JobContext): Promise<void> {
  const { brandId, jobId, payload } = ctx;
  const conversationId = payload.conversation_id as string;
  const campaignId = payload.campaign_id as string;
  const replyMode = payload.reply_mode as string;

  const now = new Date();

  // 1. Load conversation and all messages
  const [conversation] = await db
    .select()
    .from(outreachConversations)
    .where(eq(outreachConversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    logger.error({ conversationId }, 'Conversation not found');
    return;
  }

  const messages = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.conversation_id, conversationId))
    .orderBy(asc(outreachMessages.created_at));

  // 2. Load campaign context and lead data
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  const [lead] = await db
    .select()
    .from(leads)
    .where(eq(leads.id, conversation.lead_id))
    .limit(1);

  if (!campaign || !lead) {
    logger.error({ campaignId, leadId: conversation.lead_id }, 'Campaign or lead not found');
    return;
  }

  // 3. Format conversation history for the prompt
  const conversationHistory = messages
    .map((m) => {
      const dir = m.direction === 'outbound' ? 'You (outbound)' : 'Lead (inbound)';
      const body = m.body_text || m.body_html || '[empty]';
      return `[${dir}] Subject: ${m.subject || 'N/A'}\n${body}`;
    })
    .join('\n\n---\n\n');

  // 4. Load prompt template and call Claude
  const prompt = await loadActivePrompt('outreach_reply_generator_v1');

  const result = await callClaude(
    prompt,
    {
      brand_name: campaign.name,
      campaign_context: campaign.ai_reply_context || 'No specific context provided.',
      reply_tone: campaign.ai_reply_tone || 'professional and friendly',
      lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email,
      lead_company: lead.company || 'Unknown',
      lead_title: lead.title || 'Unknown',
      lead_industry: lead.industry || 'Unknown',
      conversation_history: conversationHistory,
    },
    outreachAiReplyOutputSchema,
    { retries: 2, trackUsage: { db, brandId, jobId } },
  );

  // 5. Insert AI-generated message
  const [aiMessage] = await db
    .insert(outreachMessages)
    .values({
      conversation_id: conversationId,
      direction: 'outbound',
      subject: result.data.subject,
      body_text: result.data.body_text,
      body_html: result.data.body_html || null,
      ai_generated: true,
      ai_approved: replyMode === 'ai_auto_reply' ? true : null,
    })
    .returning();

  // 6. Handle based on reply mode
  if (replyMode === 'ai_auto_reply') {
    // Auto-send: find an account and send immediately
    const [campaignLead] = await db
      .select()
      .from(campaignLeads)
      .where(
        and(
          eq(campaignLeads.campaign_id, campaignId),
          eq(campaignLeads.lead_id, conversation.lead_id),
        ),
      )
      .limit(1);

    const accountId = campaignLead?.outreach_account_id;
    if (accountId) {
      const [account] = await db
        .select()
        .from(outreachAccounts)
        .where(eq(outreachAccounts.id, accountId))
        .limit(1);

      if (account && account.status === 'active') {
        // Find the last outbound email for threading
        const [lastEmail] = await db
          .select()
          .from(outreachEmails)
          .where(
            and(
              eq(outreachEmails.campaign_lead_id, campaignLead.id),
            ),
          )
          .orderBy(sql`${outreachEmails.sent_at} DESC NULLS LAST`)
          .limit(1);

        const domain = account.email.split('@')[1];
        const messageId = generateMessageId(domain);
        const inReplyTo = lastEmail?.message_id_header || undefined;

        try {
          const sendResult = await sendOutreachEmail({
            accountId: account.id,
            encryptedApiKey: account.resend_api_key_encrypted,
            from: { email: account.email, name: account.from_name },
            to: lead.email,
            subject: `Re: ${result.data.subject}`,
            html: result.data.body_html || `<p>${result.data.body_text}</p>`,
            text: result.data.body_text,
            messageId,
            inReplyTo,
            references: inReplyTo,
          });

          // Record the sent email
          await db.insert(outreachEmails).values({
            brand_id: brandId,
            campaign_id: campaignId,
            campaign_lead_id: campaignLead.id,
            outreach_account_id: account.id,
            step_order: 0, // AI reply, not part of sequence
            from_email: account.email,
            from_name: account.from_name,
            to_email: lead.email,
            subject: `Re: ${result.data.subject}`,
            body_html: result.data.body_html || `<p>${result.data.body_text}</p>`,
            body_text: result.data.body_text,
            resend_message_id: sendResult.resendMessageId,
            message_id_header: messageId,
            in_reply_to_header: inReplyTo || null,
            status: 'sent',
            sent_at: now,
          });

          // Update message with approval
          await db
            .update(outreachMessages)
            .set({ ai_approved: true, ai_approved_at: now })
            .where(eq(outreachMessages.id, aiMessage.id));

          await emitEvent(
            EventType.OUTREACH_AI_REPLY_SENT,
            brandId,
            { conversation_id: conversationId, message_id: aiMessage.id },
            `ai-reply-sent:${aiMessage.id}`,
            'outreach_ai_reply',
          );

          logger.info({ conversationId, messageId: aiMessage.id }, 'AI reply auto-sent');
        } catch (err) {
          logger.error({ err, conversationId }, 'Failed to auto-send AI reply');
        }
      }
    }
  } else {
    // Draft mode: emit event for UI notification
    await emitEvent(
      EventType.OUTREACH_AI_REPLY_DRAFTED,
      brandId,
      { conversation_id: conversationId, message_id: aiMessage.id },
      `ai-reply-drafted:${aiMessage.id}`,
      'outreach_ai_reply',
    );

    logger.info({ conversationId, messageId: aiMessage.id }, 'AI reply draft created for approval');
  }

  // 7. Update conversation
  await db
    .update(outreachConversations)
    .set({
      ai_draft_pending: replyMode !== 'ai_auto_reply',
      last_message_at: now,
      message_count: sql`${outreachConversations.message_count} + 1`,
      updated_at: now,
    })
    .where(eq(outreachConversations.id, conversationId));
}
