import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignLeads, campaignSequenceSteps } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (campaign.status !== 'draft' && campaign.status !== 'paused') {
    return NextResponse.json({ error: 'Campaign must be in draft or paused status to start' }, { status: 400 });
  }

  // Verify steps exist
  const steps = await db.select().from(campaignSequenceSteps)
    .where(eq(campaignSequenceSteps.campaign_id, id));
  if (steps.length === 0) {
    return NextResponse.json({ error: 'Campaign must have at least one sequence step' }, { status: 400 });
  }

  const now = new Date();

  // Schedule pending leads
  await db
    .update(campaignLeads)
    .set({ status: 'scheduled', next_send_at: now, updated_at: now })
    .where(and(eq(campaignLeads.campaign_id, id), eq(campaignLeads.status, 'pending')));

  const [updated] = await db
    .update(campaigns)
    .set({ status: 'active', started_at: campaign.started_at || now, paused_at: null, updated_at: now })
    .where(eq(campaigns.id, id))
    .returning();

  return NextResponse.json(updated);
}
