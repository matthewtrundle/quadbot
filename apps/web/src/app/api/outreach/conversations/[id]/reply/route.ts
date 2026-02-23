import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import {
  outreachConversations, outreachMessages, outreachEmails,
  campaignLeads, leads, outreachAccounts,
} from '@quadbot/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { sendReplySchema } from '@quadbot/shared';
import { Resend } from 'resend';
import { decrypt } from '@quadbot/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: conversationId } = await params;

  const body = await req.json();
  const parsed = sendReplySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [conversation] = await db
    .select()
    .from(outreachConversations)
    .where(eq(outreachConversations.id, conversationId))
    .limit(1);
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [lead] = await db.select().from(leads).where(eq(leads.id, conversation.lead_id)).limit(1);
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Find the campaign lead to get the outreach account
  const [cl] = await db
    .select()
    .from(campaignLeads)
    .where(
      and(
        eq(campaignLeads.campaign_id, conversation.campaign_id),
        eq(campaignLeads.lead_id, conversation.lead_id),
      ),
    )
    .limit(1);

  if (!cl?.outreach_account_id) {
    return NextResponse.json({ error: 'No outreach account assigned' }, { status: 400 });
  }

  const [account] = await db
    .select()
    .from(outreachAccounts)
    .where(eq(outreachAccounts.id, cl.outreach_account_id))
    .limit(1);
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Get last email for threading
  const [lastEmail] = await db
    .select()
    .from(outreachEmails)
    .where(eq(outreachEmails.campaign_lead_id, cl.id))
    .orderBy(desc(outreachEmails.sent_at))
    .limit(1);

  // Send via Resend
  const apiKey = decrypt(account.resend_api_key_encrypted);
  const resend = new Resend(apiKey);

  const subject = lastEmail ? `Re: ${lastEmail.subject}` : 'Follow-up';
  const headers: Record<string, string> = {};
  if (lastEmail?.message_id_header) {
    headers['In-Reply-To'] = lastEmail.message_id_header;
    headers['References'] = lastEmail.message_id_header;
  }

  const result = await resend.emails.send({
    from: `${account.from_name} <${account.email}>`,
    to: [lead.email],
    subject,
    html: parsed.data.body_html || `<p>${parsed.data.body_text}</p>`,
    text: parsed.data.body_text,
    headers,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  // Record message
  const [message] = await db
    .insert(outreachMessages)
    .values({
      conversation_id: conversationId,
      direction: 'outbound',
      subject,
      body_text: parsed.data.body_text,
      body_html: parsed.data.body_html || null,
      from_email: account.email,
    })
    .returning();

  // Update conversation
  const now = new Date();
  await db
    .update(outreachConversations)
    .set({
      last_message_at: now,
      message_count: sql`${outreachConversations.message_count} + 1`,
      updated_at: now,
    })
    .where(eq(outreachConversations.id, conversationId));

  return NextResponse.json(message, { status: 201 });
}
