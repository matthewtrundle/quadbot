import { actionDraftGeneratorOutputSchema } from '@quadbot/shared';
import { actionDrafts, recommendations, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

export async function actionDraftGenerator(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId, payload } = ctx;

  const recommendationId = payload.recommendation_id as string;
  if (!recommendationId) throw new Error('recommendation_id required in payload');

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Only generate action drafts in Assist mode
  if (brand[0].mode !== 'assist') {
    logger.info({ jobId, mode: brand[0].mode }, 'Skipping action draft - not in Assist mode');
    return;
  }

  const rec = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, recommendationId))
    .limit(1);
  if (rec.length === 0) throw new Error(`Recommendation ${recommendationId} not found`);

  const prompt = await loadActivePrompt('action_draft_generator_v1');

  const result = await callClaude(
    prompt,
    {
      recommendation_title: rec[0].title,
      recommendation_body: rec[0].body,
      recommendation_source: rec[0].source,
      recommendation_priority: rec[0].priority,
      recommendation_data: JSON.stringify(rec[0].data),
      brand_mode: brand[0].mode,
      brand_guardrails: JSON.stringify(brand[0].guardrails),
    },
    actionDraftGeneratorOutputSchema,
  );

  const [draft] = await db.insert(actionDrafts).values({
    brand_id: brandId,
    recommendation_id: recommendationId,
    type: result.data.type,
    payload: result.data.payload,
    risk: result.data.risk,
    guardrails_applied: result.data.guardrails_applied,
    requires_approval: result.data.requires_approval,
    status: 'pending',
  }).returning();

  // Emit action_draft.created event
  await emitEvent(
    EventType.ACTION_DRAFT_CREATED,
    brandId,
    { action_draft_id: draft.id, recommendation_id: recommendationId, type: result.data.type, risk: result.data.risk },
    `draft:${draft.id}`,
    'action_draft_generator',
  );

  logger.info(
    { jobId, type: result.data.type, risk: result.data.risk },
    'Action draft generated',
  );
}
