import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignLeads } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

const _POST = async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const now = new Date();
  // Re-schedule leads that were scheduled
  await db
    .update(campaignLeads)
    .set({ status: 'scheduled', next_send_at: now, updated_at: now })
    .where(and(eq(campaignLeads.campaign_id, id), eq(campaignLeads.status, 'pending')));

  const [updated] = await db
    .update(campaigns)
    .set({ status: 'active', paused_at: null, updated_at: now })
    .where(eq(campaigns.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
};
export const POST = withRateLimit(_POST);
