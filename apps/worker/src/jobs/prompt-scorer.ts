import { db } from '@quadbot/db';
import { recommendations, actionDrafts, outcomes, promptVersions, promptPerformance } from '@quadbot/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

/**
 * Phase 5: Learning Loop Enhancement
 * Prompt Scorer - runs weekly, scores prompt_version effectiveness
 * Measures: acceptance_rate, avg outcome delta, confidence accuracy
 */
export async function promptScorer(ctx: JobContext): Promise<void> {
  const { db: database, jobId } = ctx;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Get all active prompt versions
  const activePrompts = await database
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.is_active, true));

  for (const prompt of activePrompts) {
    // Find recommendations that used this prompt version (via model_meta)
    const recsWithPrompt = await database
      .select({
        id: recommendations.id,
        model_meta: recommendations.model_meta,
      })
      .from(recommendations)
      .where(gte(recommendations.created_at, ninetyDaysAgo));

    const relevantRecs = recsWithPrompt.filter((r) => {
      const meta = r.model_meta as Record<string, unknown> | null;
      return meta?.prompt_version_id === prompt.id;
    });

    if (relevantRecs.length === 0) {
      logger.debug({ promptName: prompt.name }, 'No recommendations found for prompt');
      continue;
    }

    // Calculate acceptance rate (recommendations that got approved action drafts)
    let approved = 0;
    let totalDelta = 0;
    let outcomeCount = 0;

    for (const rec of relevantRecs) {
      const drafts = await database
        .select({ status: actionDrafts.status })
        .from(actionDrafts)
        .where(eq(actionDrafts.recommendation_id, rec.id));

      if (drafts.some((d) => d.status === 'approved' || d.status === 'executed_stub')) {
        approved++;
      }

      const recOutcomes = await database
        .select({ delta: outcomes.delta })
        .from(outcomes)
        .where(eq(outcomes.recommendation_id, rec.id));

      for (const o of recOutcomes) {
        if (o.delta != null) {
          totalDelta += o.delta;
          outcomeCount++;
        }
      }
    }

    const acceptanceRate = relevantRecs.length > 0 ? approved / relevantRecs.length : 0;
    const avgDelta = outcomeCount > 0 ? totalDelta / outcomeCount : 0;
    const effectivenessScore = (acceptanceRate * 0.5 + Math.min(Math.max(avgDelta / 10, 0), 1) * 0.5);

    // Write to prompt_performance table
    await database.insert(promptPerformance).values({
      prompt_version_id: prompt.id,
      period_start: ninetyDaysAgo,
      period_end: new Date(),
      total_recommendations: relevantRecs.length,
      accepted_count: approved,
      acceptance_rate: Math.round(acceptanceRate * 1000) / 1000,
      avg_outcome_delta: Math.round(avgDelta * 100) / 100,
      effectiveness_score: Math.round(effectivenessScore * 1000) / 1000,
    });

    logger.info({
      promptName: prompt.name,
      promptVersion: prompt.version,
      totalRecs: relevantRecs.length,
      approved,
      acceptanceRate: Math.round(acceptanceRate * 100) / 100,
      avgDelta: Math.round(avgDelta * 100) / 100,
      effectivenessScore: Math.round(effectivenessScore * 100) / 100,
    }, 'Prompt scored');
  }

  logger.info({ jobId }, 'Prompt scoring complete');
}
