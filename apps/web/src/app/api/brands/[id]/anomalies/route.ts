import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { anomalyAlerts, metricSnapshots } from '@quadbot/db';
import { eq, and, desc, gte } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const { searchParams } = new URL(req.url);
  const severity = searchParams.get('severity');
  const acknowledged = searchParams.get('acknowledged') === 'true';
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);

  const conditions = [eq(anomalyAlerts.brand_id, brandId), eq(anomalyAlerts.is_acknowledged, acknowledged)];

  if (severity) {
    conditions.push(eq(anomalyAlerts.severity, severity));
  }

  const results = await db
    .select()
    .from(anomalyAlerts)
    .where(and(...conditions))
    .orderBy(desc(anomalyAlerts.detected_at))
    .limit(limit);

  return NextResponse.json(results);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtySevenDaysAgo = new Date(now.getTime() - 37 * 24 * 60 * 60 * 1000);

  // Fetch recent snapshots (last 7 days) and baseline (previous 30 days)
  const allSnapshots = await db
    .select()
    .from(metricSnapshots)
    .where(and(eq(metricSnapshots.brand_id, brandId), gte(metricSnapshots.captured_at, thirtySevenDaysAgo)));

  // Separate into recent and baseline
  const recent: typeof allSnapshots = [];
  const baseline: typeof allSnapshots = [];

  for (const snap of allSnapshots) {
    if (new Date(snap.captured_at) >= sevenDaysAgo) {
      recent.push(snap);
    } else {
      baseline.push(snap);
    }
  }

  if (baseline.length === 0) {
    return NextResponse.json({ error: 'Insufficient baseline data for anomaly detection' }, { status: 400 });
  }

  // Group baseline by metric_key + source
  const baselineGrouped = new Map<string, { values: number[]; source: string; metricKey: string }>();
  for (const snap of baseline) {
    const key = `${snap.metric_key}::${snap.source}`;
    if (!baselineGrouped.has(key)) {
      baselineGrouped.set(key, {
        values: [],
        source: snap.source,
        metricKey: snap.metric_key,
      });
    }
    baselineGrouped.get(key)!.values.push(snap.value);
  }

  // Calculate mean and stddev for each metric baseline
  const baselineStats = new Map<string, { mean: number; stddev: number; source: string; metricKey: string }>();

  for (const [key, data] of baselineGrouped) {
    const n = data.values.length;
    if (n < 2) continue;
    const mean = data.values.reduce((s, v) => s + v, 0) / n;
    const stddev = Math.sqrt(data.values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n);
    baselineStats.set(key, {
      mean,
      stddev,
      source: data.source,
      metricKey: data.metricKey,
    });
  }

  // Group recent by metric_key + source and get latest value
  const recentByMetric = new Map<string, number>();
  for (const snap of recent) {
    const key = `${snap.metric_key}::${snap.source}`;
    const existing = recentByMetric.get(key);
    if (existing === undefined) {
      recentByMetric.set(key, snap.value);
    } else {
      // Keep the most recent (we already have all, just take last seen)
      recentByMetric.set(key, snap.value);
    }
  }

  // Detect anomalies
  const detectedAnomalies: (typeof anomalyAlerts.$inferInsert)[] = [];

  for (const [key, currentValue] of recentByMetric) {
    const stats = baselineStats.get(key);
    if (!stats || stats.stddev === 0) continue;

    const deviation = Math.abs(currentValue - stats.mean);
    const deviationStddevs = deviation / stats.stddev;

    if (deviationStddevs > 2) {
      const isIncrease = currentValue > stats.mean;
      const deviationPct = ((currentValue - stats.mean) / stats.mean) * 100;

      // Determine alert type and severity
      let alertType: string;
      let severity: string;

      if (deviationStddevs > 4) {
        alertType = isIncrease ? 'spike' : 'crash';
        severity = 'critical';
      } else if (deviationStddevs > 3) {
        alertType = isIncrease ? 'significant_increase' : 'significant_decrease';
        severity = 'high';
      } else {
        alertType = isIncrease ? 'increase' : 'decrease';
        severity = 'medium';
      }

      detectedAnomalies.push({
        brand_id: brandId,
        metric_key: stats.metricKey,
        source: stats.source,
        alert_type: alertType,
        severity,
        current_value: currentValue,
        expected_value: stats.mean,
        deviation_pct: Math.round(deviationPct * 100) / 100,
        description: `${stats.metricKey} is ${Math.abs(Math.round(deviationPct))}% ${isIncrease ? 'above' : 'below'} expected value (${currentValue.toFixed(2)} vs expected ${stats.mean.toFixed(2)})`,
        context: {
          stddev: stats.stddev,
          deviationStddevs: Math.round(deviationStddevs * 100) / 100,
          baselineDataPoints: baselineGrouped.get(key)?.values.length,
        },
      });
    }
  }

  if (detectedAnomalies.length > 0) {
    await db.insert(anomalyAlerts).values(detectedAnomalies);
  }

  return NextResponse.json({
    detected: detectedAnomalies.length,
    anomalies: detectedAnomalies.map((a) => ({
      metric_key: a.metric_key,
      alert_type: a.alert_type,
      severity: a.severity,
    })),
  });
}
