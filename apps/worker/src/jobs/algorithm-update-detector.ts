import { recommendations, brands, metricSnapshots } from '@quadbot/db';
import { eq, and, desc, gte } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import Anthropic from '@anthropic-ai/sdk';
import { trackDirectApiCall } from '../claude.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type VolatilityAnalysis = {
  is_algorithm_update: boolean;
  confidence: number;
  affected_page_types: string[];
  summary: string;
  recovery_actions: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calculate standard deviation of an array of numbers.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute day-over-day position changes from an ordered array of daily values.
 * Returns an array of absolute differences (newest first).
 */
function computeDailyChanges(dailyValues: number[]): number[] {
  const changes: number[] = [];
  for (let i = 0; i < dailyValues.length - 1; i++) {
    changes.push(Math.abs(dailyValues[i] - dailyValues[i + 1]));
  }
  return changes;
}

// ─── Main Job ───────────────────────────────────────────────────────────────

/**
 * Algorithm Update Detector
 *
 * Detects Google algorithm updates by monitoring rank volatility across GSC data.
 *
 * Steps:
 * 1. Load brand, check 'algorithm_detector' module enabled
 * 2. Fetch metricSnapshots for last 14 days (source='gsc', metric_key='avg_position')
 * 3. Calculate daily volatility (stddev of day-over-day position changes)
 * 4. Compare recent 3-day volatility vs 14-day baseline
 * 5. If recent > 2x baseline, flag potential algorithm update
 * 6. Use Claude to analyze the pattern
 * 7. Store algorithm_volatility metric
 * 8. Create HIGH priority recommendation if update detected
 * 9. Emit ALGORITHM_UPDATE_DETECTED event
 */
export async function algorithmUpdateDetector(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'algorithm_update_detector' }, 'Algorithm_Update_Detector starting');

  // 1. Load brand and check module
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('algorithm_detector')) {
    logger.info({ jobId, brandId }, 'algorithm_detector module not enabled, skipping');
    return;
  }

  // 2. Fetch metricSnapshots for last 14 days where source='gsc' and metric_key='avg_position'
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const snapshots = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.brand_id, brandId),
        eq(metricSnapshots.source, 'gsc'),
        eq(metricSnapshots.metric_key, 'avg_position'),
        gte(metricSnapshots.captured_at, fourteenDaysAgo),
      ),
    )
    .orderBy(desc(metricSnapshots.captured_at));

  if (snapshots.length < 5) {
    logger.info(
      { jobId, brandId, count: snapshots.length },
      'Insufficient position data for algorithm update detection (need at least 5 days)',
    );
    return;
  }

  // 3. Calculate daily volatility
  // snapshots are newest-first; extract daily values
  const dailyValues = snapshots.map((s) => s.value);
  const dailyChanges = computeDailyChanges(dailyValues);

  if (dailyChanges.length < 4) {
    logger.info({ jobId, brandId }, 'Not enough day-over-day changes to compute volatility');
    return;
  }

  // 4. Compare recent 3-day volatility vs 14-day baseline
  const recentChanges = dailyChanges.slice(0, 3);
  const recentVolatility = stddev(recentChanges);
  const baselineVolatility = stddev(dailyChanges);

  const volatilityRatio = baselineVolatility > 0 ? recentVolatility / baselineVolatility : 0;
  const isUpdateDetected = volatilityRatio > 2;

  logger.info(
    {
      jobId,
      brandId,
      recentVolatility: Math.round(recentVolatility * 100) / 100,
      baselineVolatility: Math.round(baselineVolatility * 100) / 100,
      volatilityRatio: Math.round(volatilityRatio * 100) / 100,
      isUpdateDetected,
    },
    'Volatility analysis computed',
  );

  // 5 & 6. Use Claude to analyze the pattern
  const anthropic = new Anthropic();
  let analysis: VolatilityAnalysis;

  try {
    const prompt = `Analyze this GSC position volatility data. Recent 3-day volatility is ${Math.round(recentVolatility * 100) / 100} vs 14-day baseline of ${Math.round(baselineVolatility * 100) / 100}. Daily position changes: ${dailyChanges.map((c) => Math.round(c * 100) / 100).join(', ')}.

Is this likely a Google algorithm update? What types of pages are most affected? What recovery actions should be taken?

Return JSON only (no markdown fences):
{
  "is_algorithm_update": true/false,
  "confidence": 0.0-1.0,
  "affected_page_types": ["blog posts", "product pages", ...],
  "summary": "Brief explanation of the pattern",
  "recovery_actions": ["Action 1", "Action 2", ...]
}`;

    const callStart = Date.now();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    trackDirectApiCall(response, { db, brandId, jobId }, callStart);

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonText);
    analysis = {
      is_algorithm_update: Boolean(parsed.is_algorithm_update),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      affected_page_types: Array.isArray(parsed.affected_page_types) ? parsed.affected_page_types.map(String) : [],
      summary: String(parsed.summary || ''),
      recovery_actions: Array.isArray(parsed.recovery_actions) ? parsed.recovery_actions.map(String) : [],
    };

    logger.info(
      { jobId, brandId, isUpdate: analysis.is_algorithm_update, confidence: analysis.confidence },
      'Claude analysis complete',
    );
  } catch (err) {
    logger.error({ jobId, brandId, err: (err as Error).message }, 'Failed to get or parse Claude response');
    throw err;
  }

  // 7. Store algorithm_volatility metric
  await db.insert(metricSnapshots).values({
    brand_id: brandId,
    source: 'algorithm_detector',
    metric_key: 'algorithm_volatility',
    value: Math.round(volatilityRatio * 100) / 100,
  });

  // 8. If update detected, create HIGH priority recommendation
  if (isUpdateDetected || analysis.is_algorithm_update) {
    const priority = analysis.confidence > 0.8 ? 'critical' : 'high';

    const body = `**Potential Google Algorithm Update Detected**

**Volatility Ratio:** ${Math.round(volatilityRatio * 100) / 100}x baseline (recent: ${Math.round(recentVolatility * 100) / 100}, baseline: ${Math.round(baselineVolatility * 100) / 100})
**Confidence:** ${Math.round(analysis.confidence * 100)}%

**Analysis:** ${analysis.summary}

**Affected Page Types:**
${analysis.affected_page_types.map((t) => `- ${t}`).join('\n')}

**Recovery Actions:**
${analysis.recovery_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;

    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'algorithm_update_detector',
        priority,
        confidence: analysis.confidence,
        title: `Potential algorithm update: ${Math.round(volatilityRatio * 100) / 100}x normal volatility`,
        body,
        data: {
          volatility_ratio: volatilityRatio,
          recent_volatility: recentVolatility,
          baseline_volatility: baselineVolatility,
          daily_changes: dailyChanges,
          affected_page_types: analysis.affected_page_types,
          recovery_actions: analysis.recovery_actions,
          is_algorithm_update: analysis.is_algorithm_update,
        },
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'algorithm_update_detector', priority },
      `algo-update:rec:${rec.id}`,
      'algorithm_update_detector',
    );
  }

  // 9. Emit ALGORITHM_UPDATE_DETECTED event
  await emitEvent(
    EventType.ALGORITHM_UPDATE_DETECTED,
    brandId,
    {
      volatility_ratio: Math.round(volatilityRatio * 100) / 100,
      is_update_detected: isUpdateDetected || analysis.is_algorithm_update,
      confidence: analysis.confidence,
      summary: analysis.summary,
    },
    `algo-update:${brandId}:${new Date().toISOString().split('T')[0]}`,
    'algorithm_update_detector',
  );

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'algorithm_update_detector',
      volatilityRatio: Math.round(volatilityRatio * 100) / 100,
      isUpdateDetected: isUpdateDetected || analysis.is_algorithm_update,
      confidence: analysis.confidence,
      durationMs: Date.now() - startTime,
    },
    'Algorithm_Update_Detector completed',
  );
}
