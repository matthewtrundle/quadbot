import { actionDraftGeneratorOutputSchema } from '@quadbot/shared';
import { actionDrafts, recommendations, brands, executionRules } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

type RecommendationData = Record<string, unknown>;

interface GscActionDraft {
  type: string;
  payload: Record<string, unknown>;
  risk: 'low' | 'medium' | 'high';
  guardrails_applied: Record<string, unknown>;
  requires_approval: boolean;
}

/**
 * Check if a recommendation from GSC digest should generate a GSC action,
 * and return the appropriate action draft if so.
 */
function tryGenerateGscAction(
  source: string,
  data: RecommendationData,
): GscActionDraft | null {
  if (source !== 'gsc_daily_digest') {
    return null;
  }

  const recType = data.type as string;
  if (!recType) {
    return null;
  }

  // Extract URL from recommendation data if available
  const pageUrl = (data.page_url || data.url) as string | undefined;

  // Map recommendation types to GSC executor types
  switch (recType) {
    case 'not_indexed':
    case 'page_not_indexed':
    case 'indexing_issue':
    case 'new_page':
    case 'content_updated':
      if (!pageUrl) {
        logger.warn({ recType }, 'GSC index request recommendation missing page URL');
        return null;
      }
      return {
        type: 'gsc-index-request',
        payload: {
          url: pageUrl,
          action: 'URL_UPDATED',
        },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    case 'crawl_error':
    case 'crawl_issue':
    case 'page_error':
    case 'fetch_error':
    case 'redirect_error':
      if (!pageUrl) {
        logger.warn({ recType }, 'GSC inspection recommendation missing page URL');
        return null;
      }
      return {
        type: 'gsc-inspection',
        payload: {
          url: pageUrl,
        },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    case 'sitemap_issue':
    case 'sitemap_error':
    case 'sitemap_missing':
    case 'sitemap_outdated':
      return {
        type: 'gsc-sitemap-notify',
        payload: {
          sitemapUrl: (data.sitemap_url as string) || undefined,
        },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    case 'deleted_page':
    case 'page_removed':
      if (!pageUrl) {
        logger.warn({ recType }, 'GSC delete request recommendation missing page URL');
        return null;
      }
      return {
        type: 'gsc-index-request',
        payload: {
          url: pageUrl,
          action: 'URL_DELETED',
        },
        risk: 'medium',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    default:
      // Not a recognized GSC action type, fall through to LLM
      return null;
  }
}

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

  const recommendation = rec[0];
  const recData = (recommendation.data || {}) as RecommendationData;

  // Check if this is a GSC recommendation that can be handled directly
  const gscAction = tryGenerateGscAction(
    recommendation.source,
    recData,
  );

  let actionType: string;
  let actionPayload: Record<string, unknown>;
  let actionRisk: 'low' | 'medium' | 'high';
  let guardrailsApplied: Record<string, unknown>;
  let requiresApproval: boolean;

  if (gscAction) {
    // Use the directly generated GSC action
    logger.info(
      { jobId, recommendationId, gscActionType: gscAction.type },
      'Generated GSC action directly from recommendation',
    );

    actionType = gscAction.type;
    actionPayload = gscAction.payload;
    actionRisk = gscAction.risk;
    guardrailsApplied = gscAction.guardrails_applied;
    requiresApproval = gscAction.requires_approval;
  } else {
    // Fall back to LLM for other recommendation types
    const prompt = await loadActivePrompt('action_draft_generator_v1');

    const guardrails = (brand[0].guardrails || {}) as Record<string, unknown>;

    const result = await callClaude(
      prompt,
      {
        recommendation_title: recommendation.title,
        recommendation_body: recommendation.body,
        recommendation_source: recommendation.source,
        recommendation_priority: recommendation.priority,
        recommendation_data: JSON.stringify(recData),
        brand_name: brand[0].name,
        brand_industry: (guardrails.industry as string) || 'unknown',
        brand_mode: brand[0].mode,
        brand_guardrails: JSON.stringify(guardrails),
      },
      actionDraftGeneratorOutputSchema,
    );

    actionType = result.data.type;
    actionPayload = result.data.payload;
    actionRisk = result.data.risk;
    guardrailsApplied = result.data.guardrails_applied;
    requiresApproval = result.data.requires_approval;
  }

  const [draft] = await db.insert(actionDrafts).values({
    brand_id: brandId,
    recommendation_id: recommendationId,
    type: actionType,
    payload: actionPayload,
    risk: actionRisk,
    guardrails_applied: guardrailsApplied,
    requires_approval: requiresApproval,
    status: 'pending',
  }).returning();

  // Emit action_draft.created event
  await emitEvent(
    EventType.ACTION_DRAFT_CREATED,
    brandId,
    { action_draft_id: draft.id, recommendation_id: recommendationId, type: actionType, risk: actionRisk },
    `draft:${draft.id}`,
    'action_draft_generator',
  );

  // Check execution rules for auto-approval
  const [rules] = await db
    .select()
    .from(executionRules)
    .where(eq(executionRules.brand_id, brandId))
    .limit(1);

  if (rules?.auto_execute) {
    const riskLevels: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const draftRiskLevel = riskLevels[actionRisk] ?? 3;
    const maxRiskLevel = riskLevels[rules.max_risk] ?? 1;
    const confidence = recommendation.confidence ?? 0;
    const allowedTypes = (rules.allowed_action_types as string[]) || [];

    const meetsConfidence = confidence >= rules.min_confidence;
    const meetsRisk = draftRiskLevel <= maxRiskLevel;
    const meetsType = allowedTypes.length === 0 || allowedTypes.includes(actionType);

    if (meetsConfidence && meetsRisk && meetsType) {
      await db
        .update(actionDrafts)
        .set({ status: 'approved', updated_at: new Date() })
        .where(eq(actionDrafts.id, draft.id));

      await emitEvent(
        EventType.ACTION_DRAFT_APPROVED,
        brandId,
        { action_draft_id: draft.id, recommendation_id: recommendationId, auto_approved: true },
        `auto-approved:${draft.id}`,
        'action_draft_generator',
      );

      logger.info(
        { jobId, draftId: draft.id, type: actionType, risk: actionRisk },
        'Action draft auto-approved by execution rules',
      );
    }
  }

  logger.info(
    { jobId, type: actionType, risk: actionRisk },
    'Action draft generated',
  );
}
