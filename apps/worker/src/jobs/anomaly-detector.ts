import { metricSnapshots, recommendations, brands, jobs } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

type AnomalyType = 'spike' | 'drop' | 'zero' | 'pattern_break';

type Anomaly = {
  metric_key: string;
  source: string;
  type: AnomalyType;
  current_value: number;
  expected_value: number;
  deviation_pct: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

const DEVIATION_THRESHOLDS = {
  low: 0.20,     // 20% deviation
  medium: 0.40,  // 40% deviation
  high: 0.60,    // 60% deviation
  critical: 0.80, // 80% deviation
};

/**
 * Phase 8: Anomaly Detector
 * Scans recent metric snapshots for anomalies using z-score approach.
 * Runs daily, creates recommendations for significant anomalies.
 */
export async function anomalyDetector(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'anomaly_detector' }, 'Anomaly_Detector starting');

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get all metric snapshots from the last 30 days
  const snapshots = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.brand_id, brandId),
        gte(metricSnapshots.captured_at, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(metricSnapshots.captured_at));

  if (snapshots.length < 7) {
    logger.info({ jobId, brandId, count: snapshots.length }, 'Insufficient data for anomaly detection');
    return;
  }

  // Group by source+metric_key
  const grouped = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const key = `${s.source}:${s.metric_key}`;
    const list = grouped.get(key) || [];
    list.push(s);
    grouped.set(key, list);
  }

  const anomalies: Anomaly[] = [];

  for (const [key, values] of grouped) {
    if (values.length < 5) continue;

    const [source, metric_key] = key.split(':');

    // Compute mean and standard deviation of historical values
    const numericValues = values.map((v) => v.value);
    const recent = numericValues[0]; // Most recent
    const historical = numericValues.slice(1); // Rest

    const mean = historical.reduce((s, v) => s + v, 0) / historical.length;
    const variance = historical.reduce((s, v) => s + (v - mean) ** 2, 0) / historical.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) continue; // No variation

    const zScore = Math.abs((recent - mean) / stdDev);
    const deviationPct = mean !== 0 ? Math.abs((recent - mean) / mean) : 0;

    // Only flag if z-score > 2 (95% confidence of anomaly)
    if (zScore < 2) continue;

    let type: AnomalyType;
    if (recent === 0 && mean > 0) type = 'zero';
    else if (recent > mean) type = 'spike';
    else type = 'drop';

    let severity: Anomaly['severity'];
    if (deviationPct >= DEVIATION_THRESHOLDS.critical) severity = 'critical';
    else if (deviationPct >= DEVIATION_THRESHOLDS.high) severity = 'high';
    else if (deviationPct >= DEVIATION_THRESHOLDS.medium) severity = 'medium';
    else severity = 'low';

    anomalies.push({
      metric_key,
      source,
      type,
      current_value: Math.round(recent * 100) / 100,
      expected_value: Math.round(mean * 100) / 100,
      deviation_pct: Math.round(deviationPct * 100),
      severity,
    });
  }

  // Create recommendations for high/critical anomalies
  let created = 0;
  for (const anomaly of anomalies) {
    if (anomaly.severity === 'low') continue; // Skip low anomalies

    const directionLabel = anomaly.type === 'spike' ? 'increase' : anomaly.type === 'zero' ? 'drop to zero' : 'decrease';
    const title = `Anomaly detected: ${anomaly.metric_key} ${directionLabel} (${anomaly.deviation_pct}% deviation)`;
    const body = `**${anomaly.source}** metric \`${anomaly.metric_key}\` shows a significant ${directionLabel}.

**What happened:** Current value is ${anomaly.current_value}, but the 30-day average is ${anomaly.expected_value}. This represents a ${anomaly.deviation_pct}% deviation from normal.

**Why it matters:** ${anomaly.type === 'drop' || anomaly.type === 'zero'
  ? 'This drop could indicate a technical issue, lost traffic source, or competitive displacement.'
  : 'This spike could represent a growth opportunity, viral content, or a data quality issue worth investigating.'}

**What to do:**
1. Investigate the root cause of this ${directionLabel}
2. Check for recent changes to campaigns, content, or technical infrastructure
3. ${anomaly.type === 'drop' ? 'Consider reverting recent changes if applicable' : 'Consider capitalizing on positive momentum'}`;

    const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      medium: 'medium',
      high: 'high',
      critical: 'critical',
    };

    await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'anomaly_detector',
      priority: priorityMap[anomaly.severity] || 'medium',
      title,
      body,
      confidence: Math.min(0.5 + (anomaly.deviation_pct / 200), 0.95),
      data: {
        anomaly_type: anomaly.type,
        rec_type: anomaly.type === 'drop' || anomaly.type === 'zero' ? 'warning' : 'opportunity',
        metric_key: anomaly.metric_key,
        source: anomaly.source,
        current_value: anomaly.current_value,
        expected_value: anomaly.expected_value,
        deviation_pct: anomaly.deviation_pct,
      },
    });
    created++;
  }

  logger.info({
    jobId,
    brandId,
    jobType: 'anomaly_detector',
    anomalies: anomalies.length,
    created,
    byType: {
      spikes: anomalies.filter((a) => a.type === 'spike').length,
      drops: anomalies.filter((a) => a.type === 'drop').length,
      zeros: anomalies.filter((a) => a.type === 'zero').length,
    },
    durationMs: Date.now() - startTime,
  }, 'Anomaly_Detector completed');
}
