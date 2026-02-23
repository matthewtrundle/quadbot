import { recommendations, actionDrafts, outcomes, metricSnapshots, signalApplications } from '@quadbot/db';
import { eq, and, lt, gte, desc } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

const OUTCOME_WINDOWS = [7, 14, 30]; // days
const INVERSE_METRICS = ['spam_rate', 'error_rate', 'bounce_rate'];

/**
 * Multi-Window Outcome Collector
 * Measures metric deltas at 7, 14, and 30 days post-execution.
 * Uses metric_snapshots for delta computation from real API data.
 */
export async function outcomeCollector(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  let collected = 0;

  for (const windowDays of OUTCOME_WINDOWS) {
    const windowAgo = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    // For the 7d window, look at recs older than 7 days;
    // For 14d, older than 14 days but newer than 21 days (to avoid re-measuring);
    // For 30d, older than 30 days but newer than 37 days.
    const windowEnd = new Date(Date.now() - (windowDays + 7) * 24 * 60 * 60 * 1000);

    const eligibleRecs = await db
      .select({
        id: recommendations.id,
        brand_id: recommendations.brand_id,
        source: recommendations.source,
        data: recommendations.data,
        created_at: recommendations.created_at,
      })
      .from(recommendations)
      .innerJoin(actionDrafts, eq(actionDrafts.recommendation_id, recommendations.id))
      .where(
        and(
          eq(recommendations.brand_id, brandId),
          eq(actionDrafts.status, 'executed_stub'),
          lt(recommendations.created_at, windowAgo),
          // Only pick up recs that haven't been through this window yet
          // (for 7d window, we don't filter by windowEnd since it's the first pass)
          ...(windowDays > 7 ? [gte(recommendations.created_at, windowEnd)] : []),
        ),
      );

    const suffix = `_${windowDays}d`;

    for (const rec of eligibleRecs) {
      const metricSource = getMetricSource(rec.source);
      const metricKey = getMetricKey(rec.source);
      const metricName = getMetricName(rec.source) + suffix;

      // Check if outcome already exists for this window
      const existing = await db
        .select({ id: outcomes.id })
        .from(outcomes)
        .where(
          and(
            eq(outcomes.recommendation_id, rec.id),
            eq(outcomes.metric_name, metricName),
          ),
        )
        .limit(1);

      if (existing.length > 0) continue;

      // Get before snapshot (closest to rec creation, before it)
      const beforeSnapshot = await db
        .select({ value: metricSnapshots.value })
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.brand_id, brandId),
            eq(metricSnapshots.source, metricSource),
            eq(metricSnapshots.metric_key, metricKey),
            lt(metricSnapshots.captured_at, rec.created_at),
          ),
        )
        .orderBy(desc(metricSnapshots.captured_at))
        .limit(1);

      // Get after snapshot (closest to windowDays after creation)
      const afterTarget = new Date(rec.created_at.getTime() + windowDays * 24 * 60 * 60 * 1000);
      const afterSnapshot = await db
        .select({ value: metricSnapshots.value })
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.brand_id, brandId),
            eq(metricSnapshots.source, metricSource),
            eq(metricSnapshots.metric_key, metricKey),
            gte(metricSnapshots.captured_at, afterTarget),
          ),
        )
        .orderBy(metricSnapshots.captured_at)
        .limit(1);

      if (beforeSnapshot.length === 0 || afterSnapshot.length === 0) {
        logger.warn({ jobId, recommendationId: rec.id, window: windowDays },
          'Skipping outcome: missing metric snapshots');
        continue;
      }

      const valueBefore = beforeSnapshot[0].value;
      const valueAfter = afterSnapshot[0].value;
      const delta = valueAfter - valueBefore;

      await db.insert(outcomes).values({
        recommendation_id: rec.id,
        metric_name: metricName,
        metric_value_before: Math.round(valueBefore * 100) / 100,
        metric_value_after: Math.round(valueAfter * 100) / 100,
        delta: Math.round(delta * 100) / 100,
      });

      // Emit event for 7d window (primary measurement)
      if (windowDays === 7) {
        await emitEvent(
          EventType.OUTCOME_COLLECTED,
          brandId,
          { recommendation_id: rec.id, metric_name: metricName, delta: Math.round(delta * 100) / 100 },
          `outcome:${rec.id}:${windowDays}d`,
          'outcome_collector',
        );

        // Close the signal outcome loop on 7d measurement
        const isPositive = INVERSE_METRICS.includes(metricKey) ? delta < 0 : delta > 0;
        const linkedApplications = await db
          .select({ id: signalApplications.id })
          .from(signalApplications)
          .where(eq(signalApplications.recommendation_id, rec.id));

        for (const app of linkedApplications) {
          await db
            .update(signalApplications)
            .set({ outcome_positive: isPositive })
            .where(eq(signalApplications.id, app.id));
        }

        if (linkedApplications.length > 0) {
          logger.info(
            { recommendationId: rec.id, isPositive, signalApplications: linkedApplications.length },
            'Updated signal application outcomes',
          );
        }
      }

      collected++;
    }
  }

  logger.info({ jobId, collected }, 'Multi-window outcome collection complete');
}

function getMetricSource(recSource: string): string {
  switch (recSource) {
    case 'gsc_daily_digest': return 'gsc';
    case 'ads_performance_digest': return 'ads';
    case 'analytics_insights': return 'ga4';
    default: return 'community';
  }
}

function getMetricKey(recSource: string): string {
  switch (recSource) {
    case 'gsc_daily_digest': return 'avg_ctr';
    case 'ads_performance_digest': return 'roas';
    case 'analytics_insights': return 'sessions';
    default: return 'spam_rate';
  }
}

function getMetricName(recSource: string): string {
  switch (recSource) {
    case 'gsc_daily_digest': return 'position_change';
    case 'ads_performance_digest': return 'roas_change';
    case 'analytics_insights': return 'sessions_change';
    default: return 'engagement_score';
  }
}
