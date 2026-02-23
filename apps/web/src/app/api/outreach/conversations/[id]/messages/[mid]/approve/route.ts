import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import {
  outreachMessages, outreachConversations, outreachEmails,
  campaignLeads, leads, outreachAccounts,
} from '@quadbot/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { Resend } from 'resend';
import { decrypt } from '@quadbot/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: conversationId, mid: messageId } = await params;

  const [message] = await db
    .select()
    .from(outreachMessages)
    .where(and(eq(outreachMessages.id, messageId), eq(outreachMessages.conversation_id, conversationId)))
    .limit(1);

  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  if (!message.ai_generated) return NextResponse.json({ error: 'Not an AI-generated message' }, { status: 400 });
  if (message.ai_approved === true) return NextResponse.json({ error: 'Already approved' }, { status: 400 });

  const [conversation] = await db
    .select()
    .from(outreachConversations)
    .where(eq(outreachConversations.id, conversationId))
    .limit(1);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const [lead] = await db.select().from(leads).where(eq(leads.id, conversation.lead_id)).limit(1);
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const [cl] = await db
    .select()
    .from(campaignLeads)
    .where(and(eq(campaignLeads.campaign_id, conversation.campaign_id), eq(campaignLeads.lead_id, conversation.lead_id)))
    .limit(1);

  if (!cl?.outreach_account_id) return NextResponse.json({ error: 'No account assigned' }, { status: 400 });

  const [account] = await db.select().from(outreachAccounts).where(eq(outreachAccounts.id, cl.outreach_account_id)).limit(1);
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Send the approved AI reply
  const apiKey = decrypt(account.resend_api_key_encrypted);
  const resend = new Resend(apiKey);

  const [lastEmail] = await db
    .select()
    .from(outreachEmails)
    .where(eq(outreachEmails.campaign_lead_id, cl.id))
    .orderBy(desc(outreachEmails.sent_at))
    .limit(1);

  const headers: Record<string, string> = {};
  if (lastEmail?.message_id_header) {
    headers['In-Reply-To'] = lastEmail.message_id_header;
    headers['References'] = lastEmail.message_id_header;
  }

  const result = await resend.emails.send({
    from: `${account.from_name} <${account.email}>`,
    to: [lead.email],
    subject: message.subject || 'Re: Follow-up',
    html: message.body_html || `<p>${message.body_text}</p>`,
    text: message.body_text || '',
    headers,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const now = new Date();
  await db
    .update(outreachMessages)
    .set({ ai_approved: true, ai_approved_at: now })
    .where(eq(outreachMessages.id, messageId));

  await db
    .update(outreachConversations)
    .set({ ai_draft_pending: false, updated_at: now })
    .where(eq(outreachConversations.id, conversationId));

  return NextResponse.json({ approved: true, sent: true });
}
