import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { predictions, anomalyAlerts, metricSnapshots, evaluationRuns } from '@quadbot/db';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const now = new Date();

  // Run all queries in parallel
  const [upcomingPredictions, recentAnomalies, accuracyBySource, recentSnapshots, evalRuns] = await Promise.all([
    // Upcoming predictions (future only)
    db
      .select()
      .from(predictions)
      .where(and(eq(predictions.brand_id, brandId), gte(predictions.prediction_date, now)))
      .orderBy(predictions.prediction_date),

    // Recent unacknowledged anomalies
    db
      .select()
      .from(anomalyAlerts)
      .where(and(eq(anomalyAlerts.brand_id, brandId), eq(anomalyAlerts.is_acknowledged, false)))
      .orderBy(desc(anomalyAlerts.detected_at))
      .limit(20),

    // Historical accuracy by source
    db
      .select({
        source: predictions.source,
        avgAccuracy: sql<number>`avg(${predictions.accuracy})`.as('avg_accuracy'),
        count: sql<number>`count(*)`.as('count'),
      })
      .from(predictions)
      .where(and(eq(predictions.brand_id, brandId), sql`${predictions.actual_value} is not null`))
      .groupBy(predictions.source),

    // Recent metric snapshots (last 7 days for trend summary)
    db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, brandId),
          gte(metricSnapshots.captured_at, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .orderBy(desc(metricSnapshots.captured_at)),

    // Recent evaluation runs
    db
      .select()
      .from(evaluationRuns)
      .where(eq(evaluationRuns.brand_id, brandId))
      .orderBy(desc(evaluationRuns.created_at))
      .limit(10),
  ]);

  // Group predictions by metric_key
  const predictionsByMetric: Record<string, typeof upcomingPredictions> = {};
  for (const pred of upcomingPredictions) {
    if (!predictionsByMetric[pred.metric_key]) {
      predictionsByMetric[pred.metric_key] = [];
    }
    predictionsByMetric[pred.metric_key].push(pred);
  }

  // Build trend summary from recent snapshots
  const trendSummary: Record<string, { currentValue: number; direction: 'up' | 'down' | 'stable'; source: string }> =
    {};

  // Group snapshots by metric_key
  const snapshotsByMetric = new Map<string, { values: { value: number; time: number }[]; source: string }>();
  for (const snap of recentSnapshots) {
    const key = snap.metric_key;
    if (!snapshotsByMetric.has(key)) {
      snapshotsByMetric.set(key, { values: [], source: snap.source });
    }
    snapshotsByMetric.get(key)!.values.push({
      value: snap.value,
      time: new Date(snap.captured_at).getTime(),
    });
  }

  for (const [metricKey, data] of snapshotsByMetric) {
    if (data.values.length < 2) {
      trendSummary[metricKey] = {
        currentValue: data.values[0]?.value ?? 0,
        direction: 'stable',
        source: data.source,
      };
      continue;
    }

    // values are sorted desc by captured_at, so [0] is most recent
    const currentValue = data.values[0].value;
    const oldestValue = data.values[data.values.length - 1].value;
    const changePct = oldestValue !== 0 ? ((currentValue - oldestValue) / Math.abs(oldestValue)) * 100 : 0;

    let direction: 'up' | 'down' | 'stable';
    if (changePct > 5) direction = 'up';
    else if (changePct < -5) direction = 'down';
    else direction = 'stable';

    trendSummary[metricKey] = { currentValue, direction, source: data.source };
  }

  // Model health from all predictions
  const allPredictionsWithAccuracy = await db
    .select({
      avgConfidence: sql<number>`avg(${predictions.confidence})`,
      avgAccuracy: sql<number>`avg(${predictions.accuracy})`,
      totalPredictions: sql<number>`count(*)`,
    })
    .from(predictions)
    .where(eq(predictions.brand_id, brandId));

  const health = allPredictionsWithAccuracy[0];

  return NextResponse.json({
    predictions: predictionsByMetric,
    anomalies: recentAnomalies,
    historicalAccuracy: accuracyBySource.map((row) => ({
      source: row.source,
      avgAccuracy: row.avgAccuracy,
      predictionCount: row.count,
    })),
    trendSummary,
    modelHealth: {
      avgConfidence: health?.avgConfidence ?? null,
      avgAccuracy: health?.avgAccuracy ?? null,
      totalPredictions: health?.totalPredictions ?? 0,
      recentEvaluations: evalRuns,
    },
  });
}
