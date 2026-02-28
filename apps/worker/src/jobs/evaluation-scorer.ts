import { recommendations, actionDrafts, outcomes, evaluationRuns, executionRules } from '@quadbot/db';
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
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'evaluation_scorer' }, 'Evaluation_Scorer starting');

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

    const isDismissed = rec.status === 'dismissed';
    const wasAccepted = !isDismissed && drafts.some(
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

  // Phase 3A: Confidence Feedback Loop
  // Adjust min_confidence threshold based on calibration error
  if (calibrationError != null && recs.length >= 10) {
    await adjustConfidenceThreshold(db, brandId, calibrationError, avgConfidence!, acceptanceRate, jobId);
  }

  logger.info({
    jobId,
    brandId,
    jobType: 'evaluation_scorer',
    totalRecs: recs.length,
    acceptanceRate: Math.round(acceptanceRate * 100),
    calibrationError: calibrationError?.toFixed(3),
    durationMs: Date.now() - startTime,
  }, 'Evaluation_Scorer completed');
}

/**
 * Phase 3A: Confidence Feedback Loop
 * Adjusts the min_confidence threshold in execution_rules based on
 * calibration error. If the system is overconfident (high confidence
 * but low acceptance), raise the threshold. If well-calibrated, allow
 * slightly more aggressive auto-execution.
 */
async function adjustConfidenceThreshold(
  db: JobContext['db'],
  brandId: string,
  calibrationError: number,
  avgConfidence: number,
  acceptanceRate: number,
  jobId: string,
): Promise<void> {
  const [rules] = await db
    .select()
    .from(executionRules)
    .where(eq(executionRules.brand_id, brandId))
    .limit(1);

  if (!rules) return;

  const currentThreshold = rules.min_confidence;
  let newThreshold = currentThreshold;

  // Overconfident: confidence >> acceptance rate (calibration_error > 0.15)
  // System predicts high confidence but users reject frequently
  // → Raise threshold to be more cautious
  if (calibrationError > 0.15 && avgConfidence > acceptanceRate) {
    const adjustment = Math.min(calibrationError * 0.3, 0.05);
    newThreshold = Math.min(currentThreshold + adjustment, 0.99);
    logger.info({
      jobId, brandId, calibrationError,
      oldThreshold: currentThreshold, newThreshold,
      direction: 'up',
    }, 'Confidence feedback: raising threshold (overconfident)');
  }
  // Well-calibrated: calibration_error < 0.05
  // → Slightly lower threshold to enable more auto-execution
  else if (calibrationError < 0.05 && acceptanceRate > 0.5) {
    const adjustment = Math.min((0.05 - calibrationError) * 0.2, 0.03);
    newThreshold = Math.max(currentThreshold - adjustment, 0.5);
    logger.info({
      jobId, brandId, calibrationError,
      oldThreshold: currentThreshold, newThreshold,
      direction: 'down',
    }, 'Confidence feedback: lowering threshold (well-calibrated)');
  }

  // Only update if meaningful change (>0.005)
  if (Math.abs(newThreshold - currentThreshold) > 0.005) {
    await db
      .update(executionRules)
      .set({
        min_confidence: Math.round(newThreshold * 1000) / 1000,
        updated_at: new Date(),
      })
      .where(eq(executionRules.id, rules.id));
  }
}
