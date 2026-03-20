import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { predictions, metricSnapshots } from '@quadbot/db';
import { eq, and, gte } from 'drizzle-orm';

function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, rSquared };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  // Fetch last 90 days of metric snapshots
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const snapshots = await db
    .select()
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.brand_id, brandId), gte(metricSnapshots.captured_at, ninetyDaysAgo)));

  if (snapshots.length === 0) {
    return NextResponse.json({ error: 'No historical data available for predictions' }, { status: 400 });
  }

  // Group by metric_key + source
  const grouped = new Map<string, typeof snapshots>();
  for (const snap of snapshots) {
    const key = `${snap.metric_key}::${snap.source}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(snap);
  }

  const forecastDays = [7, 14, 30];
  const allPredictions: (typeof predictions.$inferInsert)[] = [];
  const metricKeys = new Set<string>();

  const now = Date.now();

  for (const [compositeKey, metricSnapshots] of grouped) {
    const [metricKey, source] = compositeKey.split('::');

    // Sort by captured_at ascending
    metricSnapshots.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

    if (metricSnapshots.length < 3) continue; // Need at least 3 data points

    // Convert to x (days from first point), y (value)
    const firstTime = new Date(metricSnapshots[0].captured_at).getTime();
    const points = metricSnapshots.map((s) => ({
      x: (new Date(s.captured_at).getTime() - firstTime) / (24 * 60 * 60 * 1000),
      y: s.value,
    }));

    const { slope, intercept, rSquared } = linearRegression(points);

    // Calculate standard deviation of residuals
    const residuals = points.map((p) => p.y - (slope * p.x + intercept));
    const meanResidual = residuals.reduce((s, r) => s + r, 0) / residuals.length;
    const stddev = Math.sqrt(residuals.reduce((s, r) => s + Math.pow(r - meanResidual, 2), 0) / residuals.length);

    // Days from first point to now
    const currentX = (now - firstTime) / (24 * 60 * 60 * 1000);

    for (const daysAhead of forecastDays) {
      const futureX = currentX + daysAhead;
      const predictedValue = slope * futureX + intercept;

      // Confidence: base from R-squared, decays with days ahead
      const confidence = Math.max(0.1, Math.min(1, (1 / (1 + daysAhead * 0.03)) * Math.max(0.1, rSquared)));

      const predictionDate = new Date(now + daysAhead * 24 * 60 * 60 * 1000);

      allPredictions.push({
        brand_id: brandId,
        metric_key: metricKey,
        source: source,
        predicted_value: predictedValue,
        confidence,
        prediction_date: predictionDate,
        model_version: 'linear-regression-v1',
        context: {
          slope,
          intercept,
          rSquared,
          stddev,
          dataPoints: points.length,
          upperBound: predictedValue + 2 * stddev,
          lowerBound: predictedValue - 2 * stddev,
        },
      });

      metricKeys.add(metricKey);
    }
  }

  if (allPredictions.length === 0) {
    return NextResponse.json({ error: 'Insufficient data points for any metric (need at least 3)' }, { status: 400 });
  }

  // Batch insert predictions
  await db.insert(predictions).values(allPredictions);

  return NextResponse.json({
    generated: allPredictions.length,
    metrics: Array.from(metricKeys),
  });
}
