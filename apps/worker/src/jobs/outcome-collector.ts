import { recommendations, actionDrafts, outcomes, metricSnapshots, signalApplications } from '@quadbot/db';
import { eq, and, lt, desc } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

/**
 * Phase 5: Learning Loop Enhancement (upgraded in Phase 3)
 * Outcome Collector - runs daily, measures deltas for accepted recommendations
 * older than 7 days that don't yet have outcomes.
 * Uses metric_snapshots for delta computation from real API data.
 */
export async function outcomeCollector(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find recommendations that:
  // 1. Had action drafts that were executed (approved)
  // 2. Were created more than 7 days ago
  // 3. Don't yet have outcome records
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
        lt(recommendations.created_at, sevenDaysAgo),
      ),
    );

  let collected = 0;

  for (const rec of eligibleRecs) {
    // Check if outcome already exists
    const existing = await db
      .select({ id: outcomes.id })
      .from(outcomes)
      .where(eq(outcomes.recommendation_id, rec.id))
      .limit(1);

    if (existing.length > 0) continue;

    // Determine metric source and key based on recommendation source
    const metricSource = rec.source === 'gsc_daily_digest' ? 'gsc' : 'community';
    const metricKey = rec.source === 'gsc_daily_digest' ? 'avg_ctr' : 'spam_rate';

    // Try to get metric snapshots for before/after comparison
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

    const afterSnapshot = await db
      .select({ value: metricSnapshots.value })
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, brandId),
          eq(metricSnapshots.source, metricSource),
          eq(metricSnapshots.metric_key, metricKey),
        ),
      )
      .orderBy(desc(metricSnapshots.captured_at))
      .limit(1);

    if (beforeSnapshot.length === 0 || afterSnapshot.length === 0) {
      logger.warn({ jobId, recommendationId: rec.id },
        'Skipping outcome: missing metric snapshots');
      continue;
    }

    const valueBefore = beforeSnapshot[0].value;
    const valueAfter = afterSnapshot[0].value;
    const delta = valueAfter - valueBefore;
    const metricName = rec.source === 'gsc_daily_digest' ? 'position_change' : 'engagement_score';

    await db.insert(outcomes).values({
      recommendation_id: rec.id,
      metric_name: metricName,
      metric_value_before: Math.round(valueBefore * 100) / 100,
      metric_value_after: Math.round(valueAfter * 100) / 100,
      delta: Math.round(delta * 100) / 100,
    });

    // Emit outcome.collected event
    await emitEvent(
      EventType.OUTCOME_COLLECTED,
      brandId,
      { recommendation_id: rec.id, metric_name: metricName, delta: Math.round(delta * 100) / 100 },
      `outcome:${rec.id}`,
      'outcome_collector',
    );

    // Close the signal outcome loop: update any signal applications
    // linked to this recommendation with whether the outcome was positive.
    // This feeds back into getCrossBrandContext() weighting.
    // For most metrics (CTR, engagement), positive delta = good.
    // For inverse metrics (spam_rate, error_rate), negative delta = good.
    const inverseMetrics = ['spam_rate', 'error_rate', 'bounce_rate'];
    const isPositive = inverseMetrics.includes(metricKey) ? delta < 0 : delta > 0;
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

    collected++;
  }

  logger.info({ jobId, collected, eligible: eligibleRecs.length }, 'Outcome collection complete');
}
