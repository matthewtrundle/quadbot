import { recommendations, actionDrafts, outcomes } from '@quadbot/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

type SourceStats = {
  source: string;
  total: number;
  accepted: number;
  acceptance_rate: number;
  positive_outcomes: number;
  negative_outcomes: number;
  avg_delta: number;
  quality_score: number;
};

/**
 * Phase 3C: Source Quality Scorer
 * Tracks which recommendation sources (gsc_daily_digest, ads_performance_digest, etc.)
 * produce the best outcomes. Results are stored as metric_snapshots for the
 * strategic prioritizer to use when ranking recommendations.
 */
export async function sourceQualityScorer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Get all recommendations from the last 90 days grouped by source
  const recs = await db
    .select({
      id: recommendations.id,
      source: recommendations.source,
      status: recommendations.status,
    })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.brand_id, brandId),
        gte(recommendations.created_at, ninetyDaysAgo),
      ),
    );

  if (recs.length === 0) {
    logger.info({ jobId, brandId }, 'No recommendations to score sources');
    return;
  }

  // Group by source
  const sourceMap = new Map<string, typeof recs>();
  for (const rec of recs) {
    const list = sourceMap.get(rec.source) || [];
    list.push(rec);
    sourceMap.set(rec.source, list);
  }

  const sourceStats: SourceStats[] = [];

  for (const [source, sourceRecs] of sourceMap) {
    let accepted = 0;
    let positiveOutcomes = 0;
    let negativeOutcomes = 0;
    let totalDelta = 0;
    let deltaCount = 0;

    for (const rec of sourceRecs) {
      // Check if accepted
      const drafts = await db
        .select({ status: actionDrafts.status })
        .from(actionDrafts)
        .where(eq(actionDrafts.recommendation_id, rec.id));

      const wasAccepted = rec.status !== 'dismissed' && drafts.some(
        (d) => d.status === 'approved' || d.status === 'executed_stub' || d.status === 'executed',
      );
      if (wasAccepted) accepted++;

      // Check outcomes (use 7d window as primary)
      const recOutcomes = await db
        .select({ delta: outcomes.delta, metric_name: outcomes.metric_name })
        .from(outcomes)
        .where(eq(outcomes.recommendation_id, rec.id));

      const primary = recOutcomes.find((o) => o.metric_name.endsWith('_7d')) || recOutcomes[0];
      if (primary?.delta != null) {
        totalDelta += primary.delta;
        deltaCount++;
        if (primary.delta > 0) positiveOutcomes++;
        else if (primary.delta < 0) negativeOutcomes++;
      }
    }

    const acceptanceRate = sourceRecs.length > 0 ? accepted / sourceRecs.length : 0;
    const avgDelta = deltaCount > 0 ? totalDelta / deltaCount : 0;
    const positiveRate = deltaCount > 0 ? positiveOutcomes / deltaCount : 0;

    // Composite quality score: 40% acceptance rate + 40% positive outcome rate + 20% volume bonus
    const volumeBonus = Math.min(sourceRecs.length / 20, 1); // caps at 20 recs
    const qualityScore = acceptanceRate * 0.4 + positiveRate * 0.4 + volumeBonus * 0.2;

    sourceStats.push({
      source,
      total: sourceRecs.length,
      accepted,
      acceptance_rate: Math.round(acceptanceRate * 1000) / 1000,
      positive_outcomes: positiveOutcomes,
      negative_outcomes: negativeOutcomes,
      avg_delta: Math.round(avgDelta * 100) / 100,
      quality_score: Math.round(qualityScore * 1000) / 1000,
    });
  }

  // Store as metric snapshots for strategic prioritizer to consume
  const { metricSnapshots } = await import('@quadbot/db');
  for (const stats of sourceStats) {
    await db.insert(metricSnapshots).values({
      brand_id: brandId,
      source: 'source_quality',
      metric_key: `quality_score:${stats.source}`,
      value: stats.quality_score,
      dimensions: {
        acceptance_rate: stats.acceptance_rate,
        avg_delta: stats.avg_delta,
        total: stats.total,
        positive_outcomes: stats.positive_outcomes,
        negative_outcomes: stats.negative_outcomes,
      },
    });
  }

  logger.info({
    jobId,
    brandId,
    sources: sourceStats.length,
    stats: sourceStats.map((s) => ({
      source: s.source,
      quality: s.quality_score,
      acceptance: s.acceptance_rate,
    })),
  }, 'Source quality scoring complete');
}
