import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { gbpMetrics, gbpReviews } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  // Get latest metrics
  const metricsHistory = await db
    .select()
    .from(gbpMetrics)
    .where(eq(gbpMetrics.brand_id, brandId))
    .orderBy(desc(gbpMetrics.captured_at));

  const latestMetrics = metricsHistory.length > 0 ? metricsHistory[0] : null;

  // Get reviews sorted by created_at desc
  const reviews = await db
    .select()
    .from(gbpReviews)
    .where(eq(gbpReviews.brand_id, brandId))
    .orderBy(desc(gbpReviews.created_at));

  return NextResponse.json({
    latestMetrics,
    reviews,
    metricsHistory,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { reviewId, reply_status, reply_text } = body as {
    reviewId: string;
    reply_status?: string;
    reply_text?: string;
  };

  if (!reviewId) {
    return NextResponse.json({ error: 'Missing reviewId' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (reply_status) {
    const validStatuses = ['pending', 'draft', 'published', 'skipped'];
    if (!validStatuses.includes(reply_status)) {
      return NextResponse.json({ error: 'Invalid reply_status' }, { status: 400 });
    }
    updates.reply_status = reply_status;
    if (reply_status === 'published') {
      updates.replied_at = new Date();
    }
  }
  if (reply_text !== undefined) {
    updates.reply_text = reply_text;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  await db.update(gbpReviews).set(updates).where(eq(gbpReviews.id, reviewId));

  return NextResponse.json({ success: true });
}
