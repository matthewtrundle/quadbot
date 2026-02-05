import { signalExtractorOutputSchema } from '@quadbot/shared';
import { recommendations, outcomes, brands, signals } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';

/**
 * Phase 4: Signal Extractor
 * Triggered by outcome.collected event.
 * Extracts generalizable signals from recommendation + outcome data.
 */
export async function signalExtractor(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId, payload } = ctx;

  const recommendationId = payload.recommendation_id as string;
  if (!recommendationId) {
    logger.warn({ jobId }, 'Signal extractor: no recommendation_id in payload');
    return;
  }

  // Load recommendation and outcome
  const [rec] = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, recommendationId))
    .limit(1);

  if (!rec) {
    logger.warn({ jobId, recommendationId }, 'Signal extractor: recommendation not found');
    return;
  }

  const recOutcomes = await db
    .select()
    .from(outcomes)
    .where(eq(outcomes.recommendation_id, recommendationId));

  if (recOutcomes.length === 0) {
    logger.warn({ jobId, recommendationId }, 'Signal extractor: no outcomes found');
    return;
  }

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  let prompt;
  try {
    prompt = await loadActivePrompt('signal_extractor_v1');
  } catch {
    logger.warn({ jobId }, 'Signal extractor prompt not found, skipping');
    return;
  }

  const outcomeData = recOutcomes.map((o) => ({
    metric_name: o.metric_name,
    delta: o.delta,
    before: o.metric_value_before,
    after: o.metric_value_after,
  }));

  const result = await callClaude(
    prompt,
    {
      recommendation_title: rec.title,
      recommendation_body: rec.body,
      recommendation_source: rec.source,
      recommendation_data: JSON.stringify(rec.data),
      outcome_data: JSON.stringify(outcomeData),
      brand_name: brand[0].name,
      brand_modules: JSON.stringify(brand[0].modules_enabled),
    },
    signalExtractorOutputSchema,
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (result.data.ttl_days ?? 90));

  await db.insert(signals).values({
    source_brand_id: brandId,
    domain: result.data.domain,
    signal_type: result.data.signal_type,
    title: result.data.title,
    description: result.data.description,
    confidence: result.data.confidence,
    evidence: result.data.evidence,
    expires_at: expiresAt,
  });

  logger.info({
    jobId,
    brandId,
    domain: result.data.domain,
    signalType: result.data.signal_type,
    confidence: result.data.confidence,
  }, 'Signal extracted');
}
