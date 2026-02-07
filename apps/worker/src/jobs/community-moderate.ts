import { communityModerationOutputSchema } from '@quadbot/shared';
import { recommendations, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

export async function communityModeratePost(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId, payload } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Check if community moderation module is enabled for this brand
  const modulesEnabled = (brand[0].modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('community_moderation')) {
    logger.info({ jobId, brandId }, 'Community moderation module not enabled, skipping');
    return;
  }

  const prompt = await loadActivePrompt('community_moderation_classifier_v1');

  const result = await callClaude(
    prompt,
    {
      brand_name: brand[0].name,
      community_rules: payload.community_rules || 'Standard community guidelines apply.',
      brand_voice: payload.brand_voice || 'Professional and friendly.',
      post_author: payload.post_author || 'Unknown',
      post_content: payload.post_content || '',
      post_context: payload.post_context || '',
    },
    communityModerationOutputSchema,
  );

  const priority = result.data.needs_human_review
    ? 'high'
    : result.data.confidence > 0.8
      ? 'low'
      : 'medium';

  const [rec] = await db.insert(recommendations).values({
    brand_id: brandId,
    job_id: jobId,
    source: 'community_moderation',
    priority,
    title: `Community post: ${result.data.decision}`,
    body: result.data.reason,
    data: {
      decision: result.data.decision,
      confidence: result.data.confidence,
      tags: result.data.tags,
      needs_human_review: result.data.needs_human_review,
      post_content: payload.post_content,
    },
    model_meta: result.model_meta,
  }).returning();

  // Emit recommendation.created event
  await emitEvent(
    EventType.RECOMMENDATION_CREATED,
    brandId,
    { recommendation_id: rec.id, source: 'community_moderation', priority },
    `rec:${rec.id}`,
    'community_moderate_post',
  );

  logger.info(
    { jobId, decision: result.data.decision, confidence: result.data.confidence },
    'Community moderation complete',
  );
}
