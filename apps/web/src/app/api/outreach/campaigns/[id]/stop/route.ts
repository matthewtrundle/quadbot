import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignLeads } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

const _POST = async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const now = new Date();

  // Cancel all pending/scheduled leads
  await db
    .update(campaignLeads)
    .set({ status: 'completed', completed_at: now, next_send_at: null, updated_at: now })
    .where(
      sql`${campaignLeads.campaign_id} = ${id} AND ${campaignLeads.status} IN ('pending', 'scheduled', 'sending')`,
    );

  const [updated] = await db
    .update(campaigns)
    .set({ status: 'completed', completed_at: now, updated_at: now })
    .where(eq(campaigns.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
};
export const POST = withRateLimit(_POST);
