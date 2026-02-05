import { recommendations, actionDrafts, outcomes, evaluationRuns } from '@quadbot/db';
import { eq, and, gte, lte } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

/**
 * Phase 3: Evaluation Scorer
 * Scores recommendations batch, computes confidence calibration,
 * and writes evaluation_run summary.
 */
export async function evaluationScorer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get all recommendations in the evaluation period
  const recs = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.brand_id, brandId),
        gte(recommendations.created_at, thirtyDaysAgo),
        lte(recommendations.created_at, now),
      ),
    );

  if (recs.length === 0) {
    logger.info({ jobId, brandId }, 'No recommendations to evaluate');
    return;
  }

  let approvedCount = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;
  let totalOutcomeDelta = 0;
  let outcomeCount = 0;

  for (const rec of recs) {
    // Check if recommendation was accepted (has approved/executed action draft)
    const drafts = await db
      .select({ status: actionDrafts.status })
      .from(actionDrafts)
      .where(eq(actionDrafts.recommendation_id, rec.id));

    const wasAccepted = drafts.some(
      (d) => d.status === 'approved' || d.status === 'executed_stub' || d.status === 'executed',
    );

    if (wasAccepted) approvedCount++;

    // Track confidence
    if (rec.confidence != null) {
      totalConfidence += rec.confidence;
      confidenceCount++;
    }

    // Get outcomes for delta computation
    const recOutcomes = await db
      .select({ delta: outcomes.delta })
      .from(outcomes)
      .where(eq(outcomes.recommendation_id, rec.id));

    for (const o of recOutcomes) {
      if (o.delta != null) {
        totalOutcomeDelta += o.delta;
        outcomeCount++;
      }
    }

    // Compute evaluation score for this recommendation
    const acceptedScore = wasAccepted ? 1.0 : 0.0;
    const outcomeScore = recOutcomes.length > 0
      ? Math.min(Math.max((recOutcomes[0]?.delta || 0) / 10, -1), 1)
      : 0;
    const evalScore = acceptedScore * 0.5 + (outcomeScore + 1) / 2 * 0.5;

    await db
      .update(recommendations)
      .set({ evaluation_score: Math.round(evalScore * 100) / 100 })
      .where(eq(recommendations.id, rec.id));
  }

  const acceptanceRate = recs.length > 0 ? approvedCount / recs.length : 0;
  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : null;
  const avgOutcomeDelta = outcomeCount > 0 ? totalOutcomeDelta / outcomeCount : null;

  // Calibration error: |avg_confidence - acceptance_rate|
  const calibrationError = avgConfidence != null
    ? Math.abs(avgConfidence - acceptanceRate)
    : null;

  // Write evaluation run
  await db.insert(evaluationRuns).values({
    brand_id: brandId,
    period_start: thirtyDaysAgo,
    period_end: now,
    total_recommendations: recs.length,
    acceptance_rate: Math.round(acceptanceRate * 1000) / 1000,
    avg_confidence: avgConfidence != null ? Math.round(avgConfidence * 1000) / 1000 : null,
    calibration_error: calibrationError != null ? Math.round(calibrationError * 1000) / 1000 : null,
    avg_outcome_delta: avgOutcomeDelta != null ? Math.round(avgOutcomeDelta * 100) / 100 : null,
  });

  logger.info({
    jobId,
    brandId,
    totalRecs: recs.length,
    acceptanceRate: Math.round(acceptanceRate * 100),
    calibrationError: calibrationError?.toFixed(3),
  }, 'Evaluation scoring complete');
}
