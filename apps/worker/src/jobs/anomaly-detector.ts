import { metricSnapshots, recommendations, brands, jobs } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { detectTrend } from '../lib/trend-analysis.js';

type AnomalyType = 'spike' | 'drop' | 'zero' | 'pattern_break' | 'sustained_trend';

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
  low: 0.2, // 20% deviation
  medium: 0.4, // 40% deviation
  high: 0.6, // 60% deviation
  critical: 0.8, // 80% deviation
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
    .where(and(eq(metricSnapshots.brand_id, brandId), gte(metricSnapshots.captured_at, thirtyDaysAgo)))
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

  // Pass 2: Trend detection on 30-day series
  for (const [key, values] of grouped) {
    if (values.length < 7) continue;

    const [source, metric_key] = key.split(':');

    // Values are sorted newest-first, reverse for chronological order
    const chronological = [...values].reverse().map((v) => v.value);
    const trend = detectTrend(chronological);

    // Flag accelerating decline: negative slope with strong R-squared
    if (trend.direction === 'down' && trend.rSquared > 0.6) {
      // Check if already flagged by z-score pass
      const alreadyFlagged = anomalies.some((a) => a.metric_key === metric_key && a.source === source);
      if (!alreadyFlagged) {
        const deviationPct = Math.abs(trend.rateOfChange);
        let severity: Anomaly['severity'];
        if (deviationPct >= DEVIATION_THRESHOLDS.critical * 100) severity = 'critical';
        else if (deviationPct >= DEVIATION_THRESHOLDS.high * 100) severity = 'high';
        else if (deviationPct >= DEVIATION_THRESHOLDS.medium * 100) severity = 'medium';
        else severity = 'low';

        anomalies.push({
          metric_key,
          source,
          type: 'sustained_trend',
          current_value: chronological[chronological.length - 1],
          expected_value: chronological[0],
          deviation_pct: Math.round(deviationPct),
          severity,
        });
      }
    }

    // Flag accelerating growth as opportunity
    if (trend.direction === 'up' && trend.rSquared > 0.6 && trend.rateOfChange > 30) {
      const alreadyFlagged = anomalies.some((a) => a.metric_key === metric_key && a.source === source);
      if (!alreadyFlagged) {
        anomalies.push({
          metric_key,
          source,
          type: 'sustained_trend',
          current_value: chronological[chronological.length - 1],
          expected_value: chronological[0],
          deviation_pct: Math.round(trend.rateOfChange),
          severity: 'medium',
        });
      }
    }
  }

  // Create recommendations for high/critical anomalies
  let created = 0;
  for (const anomaly of anomalies) {
    if (anomaly.severity === 'low') continue; // Skip low anomalies

    let directionLabel: string;
    if (anomaly.type === 'sustained_trend') {
      directionLabel = anomaly.current_value > anomaly.expected_value ? 'sustained growth' : 'sustained decline';
    } else if (anomaly.type === 'spike') {
      directionLabel = 'increase';
    } else if (anomaly.type === 'zero') {
      directionLabel = 'drop to zero';
    } else {
      directionLabel = 'decrease';
    }

    const title =
      anomaly.type === 'sustained_trend'
        ? `Trend detected: ${anomaly.metric_key} ${directionLabel} (${anomaly.deviation_pct}% over 30 days)`
        : `Anomaly detected: ${anomaly.metric_key} ${directionLabel} (${anomaly.deviation_pct}% deviation)`;

    let body: string;
    if (anomaly.type === 'sustained_trend') {
      const isDecline = anomaly.current_value < anomaly.expected_value;
      body = `**${anomaly.source}** metric \`${anomaly.metric_key}\` shows a ${directionLabel} over the past 30 days.

**What happened:** Value moved from ${anomaly.expected_value} to ${anomaly.current_value}, a ${anomaly.deviation_pct}% change with high statistical confidence.

**Why it matters:** ${
        isDecline
          ? 'A sustained decline suggests a structural issue rather than a temporary fluctuation. This requires strategic intervention.'
          : 'Sustained growth indicates a positive trend worth reinforcing. Understanding the drivers can help replicate success.'
      }

**What to do:**
1. ${isDecline ? 'Investigate root causes — content freshness, competitive changes, or technical issues' : 'Identify what is driving this growth'}
2. ${isDecline ? 'Compare against competitor trends for the same period' : 'Consider scaling efforts in this area'}
3. ${isDecline ? 'Develop a recovery plan targeting the declining metric' : 'Document learnings and apply to other metrics'}`;
    } else {
      body = `**${anomaly.source}** metric \`${anomaly.metric_key}\` shows a significant ${directionLabel}.

**What happened:** Current value is ${anomaly.current_value}, but the 30-day average is ${anomaly.expected_value}. This represents a ${anomaly.deviation_pct}% deviation from normal.

**Why it matters:** ${
        anomaly.type === 'drop' || anomaly.type === 'zero'
          ? 'This drop could indicate a technical issue, lost traffic source, or competitive displacement.'
          : 'This spike could represent a growth opportunity, viral content, or a data quality issue worth investigating.'
      }

**What to do:**
1. Investigate the root cause of this ${directionLabel}
2. Check for recent changes to campaigns, content, or technical infrastructure
3. ${anomaly.type === 'drop' ? 'Consider reverting recent changes if applicable' : 'Consider capitalizing on positive momentum'}`;
    }

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
      confidence: Math.min(0.5 + anomaly.deviation_pct / 200, 0.95),
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

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'anomaly_detector',
      anomalies: anomalies.length,
      created,
      byType: {
        spikes: anomalies.filter((a) => a.type === 'spike').length,
        drops: anomalies.filter((a) => a.type === 'drop').length,
        zeros: anomalies.filter((a) => a.type === 'zero').length,
        sustained_trends: anomalies.filter((a) => a.type === 'sustained_trend').length,
      },
      durationMs: Date.now() - startTime,
    },
    'Anomaly_Detector completed',
  );
}
