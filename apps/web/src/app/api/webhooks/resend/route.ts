import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { db } from '@/lib/db';
import { outreachEmails, leads, campaignLeads, outreachAccounts } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const body = await req.text();
  const svixId = req.headers.get('svix-id') || '';
  const svixTimestamp = req.headers.get('svix-timestamp') || '';
  const svixSignature = req.headers.get('svix-signature') || '';

  let event: any;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as any;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const resendEmailId = event.data?.email_id;
  if (!resendEmailId) {
    return NextResponse.json({ ok: true });
  }

  // Find the outreach email by resend_message_id
  const [email] = await db
    .select()
    .from(outreachEmails)
    .where(eq(outreachEmails.resend_message_id, resendEmailId))
    .limit(1);

  if (!email) {
    return NextResponse.json({ ok: true }); // Not our email
  }

  const now = new Date();

  switch (event.type) {
    case 'email.delivered':
      await db
        .update(outreachEmails)
        .set({ status: 'delivered', delivered_at: now })
        .where(eq(outreachEmails.id, email.id));
      break;

    case 'email.opened':
      await db
        .update(outreachEmails)
        .set({
          status: 'opened',
          opened_at: email.opened_at ? undefined : now,
          open_count: sql`${outreachEmails.open_count} + 1`,
        })
        .where(eq(outreachEmails.id, email.id));
      break;

    case 'email.clicked':
      await db
        .update(outreachEmails)
        .set({
          status: 'clicked',
          clicked_at: email.clicked_at ? undefined : now,
          click_count: sql`${outreachEmails.click_count} + 1`,
        })
        .where(eq(outreachEmails.id, email.id));
      break;

    case 'email.bounced':
      await db
        .update(outreachEmails)
        .set({ status: 'bounced', bounced_at: now, error: event.data?.bounce_type || 'bounced' })
        .where(eq(outreachEmails.id, email.id));

      // Mark lead as bounced
      const [cl] = await db
        .select()
        .from(campaignLeads)
        .where(eq(campaignLeads.id, email.campaign_lead_id))
        .limit(1);
      if (cl) {
        await db
          .update(leads)
          .set({ is_bounced: true, updated_at: now })
          .where(eq(leads.id, cl.lead_id));
        await db
          .update(campaignLeads)
          .set({ status: 'bounced', next_send_at: null, updated_at: now })
          .where(eq(campaignLeads.id, cl.id));
      }

      // Update account bounce stats
      await db
        .update(outreachAccounts)
        .set({
          total_bounced: sql`${outreachAccounts.total_bounced} + 1`,
          updated_at: now,
        })
        .where(eq(outreachAccounts.id, email.outreach_account_id));
      break;

    case 'email.complained':
      await db
        .update(outreachEmails)
        .set({ status: 'complained', complained_at: now })
        .where(eq(outreachEmails.id, email.id));

      // Mark lead as unsubscribed
      const [cl2] = await db
        .select()
        .from(campaignLeads)
        .where(eq(campaignLeads.id, email.campaign_lead_id))
        .limit(1);
      if (cl2) {
        await db
          .update(leads)
          .set({ is_unsubscribed: true, updated_at: now })
          .where(eq(leads.id, cl2.lead_id));
        await db
          .update(campaignLeads)
          .set({ status: 'unsubscribed', next_send_at: null, updated_at: now })
          .where(eq(campaignLeads.id, cl2.id));
      }

      // Update account complaint stats
      await db
        .update(outreachAccounts)
        .set({
          total_complained: sql`${outreachAccounts.total_complained} + 1`,
          updated_at: now,
        })
        .where(eq(outreachAccounts.id, email.outreach_account_id));
      break;
  }

  return NextResponse.json({ ok: true });
}
