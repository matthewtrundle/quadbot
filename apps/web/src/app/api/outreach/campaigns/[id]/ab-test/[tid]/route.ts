import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaignAbTests } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId, tid } = await params;

  const [test] = await db
    .select()
    .from(campaignAbTests)
    .where(and(eq(campaignAbTests.id, tid), eq(campaignAbTests.campaign_id, campaignId)))
    .limit(1);

  if (!test) return NextResponse.json({ error: 'A/B test not found' }, { status: 404 });

  return NextResponse.json(test);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; tid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId, tid } = await params;

  const body = await req.json();
  const { status, winner } = body;

  const updateData: Record<string, unknown> = {
    updated_at: new Date(),
  };

  if (status) {
    updateData.status = status;
    if (status === 'completed') {
      updateData.completed_at = new Date();
    }
  }

  if (winner) {
    updateData.winner = winner;
    updateData.status = 'completed';
    updateData.completed_at = new Date();
  }

  const [updated] = await db
    .update(campaignAbTests)
    .set(updateData)
    .where(and(eq(campaignAbTests.id, tid), eq(campaignAbTests.campaign_id, campaignId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'A/B test not found' }, { status: 404 });

  return NextResponse.json(updated);
}
