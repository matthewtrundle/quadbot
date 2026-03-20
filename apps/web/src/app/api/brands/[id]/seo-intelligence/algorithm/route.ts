import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { metricSnapshots, recommendations } from '@quadbot/db';
import { eq, and, desc, gte } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  // Fetch volatility snapshots from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const snapshots = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.brand_id, brandId),
        eq(metricSnapshots.source, 'algorithm_detector'),
        gte(metricSnapshots.captured_at, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(metricSnapshots.captured_at));

  // Compute baseline volatility (average of all points)
  const values = snapshots.map((s) => s.value);
  const baseline = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const alertThreshold = baseline * 2;

  // Build volatility data (last 14 days for chart)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const volatilityData = snapshots
    .filter((s) => new Date(s.captured_at) >= fourteenDaysAgo)
    .reverse()
    .map((s) => ({
      date: new Date(s.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      volatility: Math.round(s.value * 100) / 100,
      aboveThreshold: s.value > alertThreshold,
    }));

  // Fetch algorithm update alerts (recommendations)
  const alerts = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.brand_id, brandId),
        eq(recommendations.source, 'algorithm_update_detector'),
        eq(recommendations.status, 'active'),
      ),
    )
    .orderBy(desc(recommendations.created_at))
    .limit(10);

  return NextResponse.json({
    volatilityData,
    alerts: alerts.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      created_at: a.created_at,
      confidence: a.confidence,
      data: a.data ?? {},
    })),
    alertThreshold: Math.round(alertThreshold * 100) / 100,
  });
}
