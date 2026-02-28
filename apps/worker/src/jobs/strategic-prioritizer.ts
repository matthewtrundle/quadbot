import { recommendations, brands, playbooks } from '@quadbot/db';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { JobContext } from '../registry.js';
import { callClaude, callClaudeWithTools } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { computeBaseScore, applyClaudeDelta, estimateReviewMinutes } from '../scoring.js';
import { getCrossBrandContext } from '../cross-brand-context.js';
import { getPlaybookContext, executePlaybook } from '../playbook-engine.js';
import { retrieveContext } from '../lib/rag-pipeline.js';
import { TOOL_DEFINITIONS, executeTool } from '../lib/claude-tools.js';

const strategicPrioritizerOutputSchema = z.object({
  adjustments: z.array(
    z.object({
      recommendation_id: z.string(),
      delta_rank: z.number().min(-2).max(2),
      effort_estimate: z.enum(['minutes', 'hours', 'days']),
      reasoning: z.string(),
      drop: z.boolean().optional(),
    }),
  ),
});

/**
 * Phase 5: Strategic Prioritizer
 * Deterministic base score + Claude delta adjustment.
 * Runs daily, ranks all pending recommendations per brand.
 */
export async function strategicPrioritizer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'strategic_prioritizer' }, 'Strategic_Prioritizer starting');

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Get pending recommendations (no priority_rank yet, or needs re-ranking)
  const pendingRecs = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.brand_id, brandId), isNull(recommendations.priority_rank)));

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

  // Step 3: Playbook context from active playbooks
  const playbookContext = await getPlaybookContext(
    db,
    brandId,
    pendingRecs.map((r) => ({
      source: r.source,
      priority: r.priority,
      type: (r.data as Record<string, string>)?.type,
    })),
  );

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

  // Retrieve RAG context for brand knowledge (non-blocking, best-effort)
  let ragContext: string | undefined;
  try {
    const rag = await retrieveContext(db, {
      brandId,
      query: `Strategic prioritization for ${brand[0].name} recommendations`,
      sourceTypes: ['recommendation', 'artifact'],
      maxChunks: 3,
    });
    ragContext = rag?.formatted;
  } catch {
    // RAG is optional — continue without it
  }

  const toolContext = { db, brandId };
  const toolExecutor = (name: string, input: Record<string, unknown>) => executeTool(name, input, toolContext);

  const result = await callClaudeWithTools(
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
    TOOL_DEFINITIONS,
    toolExecutor,
    { signalContext, playbookContext, ragContext, trackUsage: { db, brandId, jobId } },
  );

  // Step 5: Apply adjustments + hard relevance gate
  const adjustmentMap = new Map(result.data.adjustments.map((a) => [a.recommendation_id, a]));

  const MIN_FINAL_SCORE = 0.2;
  let droppedCount = 0;

  for (const rec of scored) {
    const adjustment = adjustmentMap.get(rec.id);
    const deltaRank = adjustment?.delta_rank || 0;
    const effortEstimate = adjustment?.effort_estimate || rec.effort_estimate || 'hours';

    await db
      .update(recommendations)
      .set({
        base_score: Math.round(rec.computed_base_score * 1000) / 1000,
        claude_delta: Math.round(deltaRank * 10) / 10,
        effort_estimate: effortEstimate,
      })
      .where(eq(recommendations.id, rec.id));
  }

  // Build final scored list, excluding Claude-dropped and below-threshold recs
  const finalScored = scored.map((rec) => {
    const adjustment = adjustmentMap.get(rec.id);
    const deltaRank = adjustment?.delta_rank || 0;
    return {
      id: rec.id,
      finalScore: applyClaudeDelta(rec.computed_base_score, deltaRank),
      effortEstimate: adjustment?.effort_estimate || rec.effort_estimate || 'hours',
      drop: adjustment?.drop === true,
      reasoning: adjustment?.reasoning || '',
    };
  });

  // Partition into kept vs dropped
  const kept = finalScored.filter((r) => !r.drop && r.finalScore >= MIN_FINAL_SCORE);
  const dropped = finalScored.filter((r) => r.drop || r.finalScore < MIN_FINAL_SCORE);

  kept.sort((a, b) => b.finalScore - a.finalScore);

  // Assign ranks to kept recommendations
  for (let i = 0; i < kept.length; i++) {
    await db
      .update(recommendations)
      .set({
        priority_rank: i + 1,
        roi_score: Math.round(kept[i].finalScore * 1000) / 1000,
      })
      .where(eq(recommendations.id, kept[i].id));
  }

  // Mark dropped recommendations: priority_rank = -1 signals "dropped by prioritizer"
  for (const rec of dropped) {
    droppedCount++;
    await db
      .update(recommendations)
      .set({
        priority_rank: -1,
        roi_score: Math.round(rec.finalScore * 1000) / 1000,
      })
      .where(eq(recommendations.id, rec.id));
    logger.info(
      { jobId, recommendationId: rec.id, reason: rec.drop ? 'claude_drop' : 'below_threshold', score: rec.finalScore },
      'Dropped recommendation from prioritization',
    );
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'strategic_prioritizer',
      rankedCount: kept.length,
      droppedCount,
      adjustmentsApplied: result.data.adjustments.length,
      durationMs: Date.now() - startTime,
    },
    'Strategic_Prioritizer completed',
  );

  // Step 6: Execute playbooks for kept recommendations
  try {
    const activePlaybooks = await db
      .select()
      .from(playbooks)
      .where(and(eq(playbooks.brand_id, brandId), eq(playbooks.is_active, true)));

    if (activePlaybooks.length > 0) {
      const priorityLevels: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
      let playbookActionCount = 0;

      // Build a lookup of kept recommendation IDs to their original rec data
      const keptRecIds = new Set(kept.map((k) => k.id));
      const keptRecs = scored.filter((r) => keptRecIds.has(r.id));

      for (const rec of keptRecs) {
        const recType = (rec.data as Record<string, string>)?.type;

        for (const playbook of activePlaybooks) {
          const conditions = playbook.trigger_conditions as {
            sources?: string[];
            min_priority?: string;
            recommendation_types?: string[];
          };

          let matches = false;

          if (conditions.sources && conditions.sources.includes(rec.source)) {
            matches = true;
          }

          if (conditions.min_priority) {
            const recLevel = priorityLevels[rec.priority] || 0;
            const minLevel = priorityLevels[conditions.min_priority] || 0;
            if (recLevel >= minLevel) {
              matches = true;
            }
          }

          if (conditions.recommendation_types && recType) {
            if (conditions.recommendation_types.includes(recType)) {
              matches = true;
            }
          }

          if (matches) {
            await executePlaybook(db, brandId, rec.id, playbook);
            const actionsInPlaybook = (playbook.actions as unknown[])?.length || 0;
            playbookActionCount += actionsInPlaybook;
          }
        }
      }

      if (playbookActionCount > 0) {
        logger.info(
          {
            jobId,
            brandId,
            playbooksChecked: activePlaybooks.length,
            actionDraftsCreated: playbookActionCount,
          },
          'Playbook execution completed — action drafts created',
        );
      }
    }
  } catch (err) {
    logger.error({ jobId, brandId, err }, 'Playbook execution failed (non-fatal)');
  }
}
