import { recommendations, brands, playbooks } from '@quadbot/db';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { computeBaseScore, applyClaudeDelta, estimateReviewMinutes } from '../scoring.js';
import { getCrossBrandContext } from '../cross-brand-context.js';

const strategicPrioritizerOutputSchema = z.object({
  adjustments: z.array(z.object({
    recommendation_id: z.string(),
    delta_rank: z.number().min(-2).max(2),
    effort_estimate: z.enum(['minutes', 'hours', 'days']),
    reasoning: z.string(),
  })),
});

/**
 * Phase 5: Strategic Prioritizer
 * Deterministic base score + Claude delta adjustment.
 * Runs daily, ranks all pending recommendations per brand.
 */
export async function strategicPrioritizer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Get pending recommendations (no priority_rank yet, or needs re-ranking)
  const pendingRecs = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.brand_id, brandId),
        isNull(recommendations.priority_rank),
      ),
    );

  if (pendingRecs.length === 0) {
    logger.info({ jobId, brandId }, 'No pending recommendations to prioritize');
    return;
  }

  // Step 1: Compute deterministic base scores
  const scored = pendingRecs.map((rec) => ({
    ...rec,
    computed_base_score: computeBaseScore({
      priority: rec.priority,
      confidence: rec.confidence,
      effortEstimate: rec.effort_estimate,
      strategicAlignment: rec.strategic_alignment,
      createdAt: rec.created_at,
    }),
  }));

  // Sort by base score for initial ranking
  scored.sort((a, b) => b.computed_base_score - a.computed_base_score);

  // Step 2: Get cross-brand signals
  const sourceDomain = pendingRecs[0]?.source === 'gsc_daily_digest' ? 'seo' : 'community';
  const signalContext = await getCrossBrandContext(brandId, sourceDomain);

  // Step 3: Find matching playbooks
  const activePlaybooks = await db
    .select()
    .from(playbooks)
    .where(eq(playbooks.is_active, true));

  const playbookContext = activePlaybooks
    .map((p) => `[${p.domain}] ${JSON.stringify(p.recommended_actions)}`)
    .join('\n')
    .substring(0, 1000);

  // Step 4: Call Claude for bounded adjustments
  let prompt;
  try {
    prompt = await loadActivePrompt('strategic_prioritizer_v1');
  } catch {
    logger.warn({ jobId }, 'Strategic prioritizer prompt not found, using base scores only');
    // Fall back to base scores only
    for (let i = 0; i < scored.length; i++) {
      await db
        .update(recommendations)
        .set({
          base_score: Math.round(scored[i].computed_base_score * 1000) / 1000,
          priority_rank: i + 1,
          effort_estimate: scored[i].effort_estimate || 'hours',
        })
        .where(eq(recommendations.id, scored[i].id));
    }
    return;
  }

  const recsForClaude = scored.map((rec, i) => ({
    recommendation_id: rec.id,
    rank: i + 1,
    base_score: Math.round(rec.computed_base_score * 1000) / 1000,
    title: rec.title,
    source: rec.source,
    priority: rec.priority,
  }));

  const result = await callClaude(
    prompt,
    {
      brand_name: brand[0].name,
      brand_mode: brand[0].mode,
      brand_modules: JSON.stringify(brand[0].modules_enabled),
      recommendations_json: JSON.stringify(recsForClaude),
      signal_context: signalContext || undefined,
      playbook_context: playbookContext || undefined,
      time_budget: brand[0].time_budget_minutes_per_day || 30,
    },
    strategicPrioritizerOutputSchema,
    { signalContext, playbookContext },
  );

  // Step 5: Apply adjustments
  const adjustmentMap = new Map(
    result.data.adjustments.map((a) => [a.recommendation_id, a]),
  );

  for (const rec of scored) {
    const adjustment = adjustmentMap.get(rec.id);
    const deltaRank = adjustment?.delta_rank || 0;
    const effortEstimate = adjustment?.effort_estimate || rec.effort_estimate || 'hours';
    const finalScore = applyClaudeDelta(rec.computed_base_score, deltaRank);

    await db
      .update(recommendations)
      .set({
        base_score: Math.round(rec.computed_base_score * 1000) / 1000,
        claude_delta: Math.round(deltaRank * 10) / 10,
        effort_estimate: effortEstimate,
      })
      .where(eq(recommendations.id, rec.id));
  }

  // Re-sort by final score and assign ranks
  const finalScored = scored.map((rec) => {
    const adjustment = adjustmentMap.get(rec.id);
    const deltaRank = adjustment?.delta_rank || 0;
    return {
      id: rec.id,
      finalScore: applyClaudeDelta(rec.computed_base_score, deltaRank),
      effortEstimate: adjustment?.effort_estimate || rec.effort_estimate || 'hours',
    };
  });

  finalScored.sort((a, b) => b.finalScore - a.finalScore);

  for (let i = 0; i < finalScored.length; i++) {
    await db
      .update(recommendations)
      .set({
        priority_rank: i + 1,
        roi_score: Math.round(finalScored[i].finalScore * 1000) / 1000,
      })
      .where(eq(recommendations.id, finalScored[i].id));
  }

  logger.info({
    jobId,
    brandId,
    rankedCount: scored.length,
    adjustmentsApplied: result.data.adjustments.length,
  }, 'Strategic prioritization complete');
}
