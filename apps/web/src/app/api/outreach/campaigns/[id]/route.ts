import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignSequenceSteps, campaignLeads, outreachEmails } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';
import { updateCampaignSchema } from '@quadbot/shared';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const steps = await db.select().from(campaignSequenceSteps)
    .where(eq(campaignSequenceSteps.campaign_id, id))
    .orderBy(campaignSequenceSteps.step_order);

  const leadStats = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where ${campaignLeads.status} = 'pending')`,
      scheduled: sql<number>`count(*) filter (where ${campaignLeads.status} = 'scheduled')`,
      sent: sql<number>`count(*) filter (where ${campaignLeads.status} = 'sent')`,
      replied: sql<number>`count(*) filter (where ${campaignLeads.status} = 'replied')`,
      bounced: sql<number>`count(*) filter (where ${campaignLeads.status} = 'bounced')`,
      completed: sql<number>`count(*) filter (where ${campaignLeads.status} = 'completed')`,
    })
    .from(campaignLeads)
    .where(eq(campaignLeads.campaign_id, id));

  const emailStats = await db
    .select({
      total: sql<number>`count(*)`,
      delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
      opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
      clicked: sql<number>`count(*) filter (where ${outreachEmails.status} = 'clicked')`,
      bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
    })
    .from(outreachEmails)
    .where(eq(outreachEmails.campaign_id, id));

  return NextResponse.json({
    ...campaign,
    steps,
    lead_stats: leadStats[0],
    email_stats: emailStats[0],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const parsed = updateCampaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [updated] = await db
    .update(campaigns)
    .set({ ...parsed.data, updated_at: new Date() })
    .where(eq(campaigns.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [deleted] = await db.delete(campaigns).where(eq(campaigns.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
