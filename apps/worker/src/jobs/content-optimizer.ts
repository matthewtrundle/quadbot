import { contentOptimizerOutputSchema } from '@quadbot/shared';
import { recommendations, brands, artifacts, brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
import { eq, and, lt, isNull, or } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

type GscPageData = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * Content Optimizer Job
 *
 * Analyzes underperforming pages from GSC data and generates:
 * - Title tag variants with predicted CTR lift
 * - Meta description options
 * - Content briefs with outlines
 * - Internal linking suggestions
 *
 * Triggered: Daily after GSC digest, or via event when low CTR detected
 */
export async function contentOptimizer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId, payload } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Load prompt
  let prompt;
  try {
    prompt = await loadActivePrompt('content_optimizer_v1');
  } catch {
    logger.warn({ jobId }, 'Content optimizer prompt not found, skipping');
    return;
  }

  // Get underperforming pages from payload or simulate
  const pagesToOptimize = await getUnderperformingPages(db, brandId, payload);

  if (pagesToOptimize.length === 0) {
    logger.info({ jobId, brandId }, 'No underperforming pages to optimize');
    return;
  }

  logger.info({ jobId, brandId, pageCount: pagesToOptimize.length }, 'Optimizing pages');

  for (const page of pagesToOptimize) {
    try {
      const result = await callClaude(
        prompt,
        {
          brand_name: brand[0].name,
          page_url: page.page,
          current_metrics: JSON.stringify({
            clicks: page.clicks,
            impressions: page.impressions,
            ctr: page.ctr,
            position: page.position,
          }),
          current_title: page.page, // Would be fetched from actual page in production
        },
        contentOptimizerOutputSchema,
      );

      // Create artifacts for each optimization type
      const artifactsToCreate = [];

      // Title variants artifact
      if (result.data.title_variants.length > 0) {
        artifactsToCreate.push({
          brand_id: brandId,
          type: 'title_variant',
          title: `Title Options: ${page.page}`,
          content: {
            page_url: page.page,
            variants: result.data.title_variants,
            current_title: result.data.current_title,
          },
          status: 'draft',
        });
      }

      // Meta descriptions artifact
      if (result.data.meta_descriptions.length > 0) {
        artifactsToCreate.push({
          brand_id: brandId,
          type: 'meta_description',
          title: `Meta Descriptions: ${page.page}`,
          content: {
            page_url: page.page,
            descriptions: result.data.meta_descriptions,
          },
          status: 'draft',
        });
      }

      // Content brief artifact
      if (result.data.content_brief) {
        artifactsToCreate.push({
          brand_id: brandId,
          type: 'content_brief',
          title: `Content Brief: ${result.data.content_brief.target_keyword}`,
          content: {
            page_url: page.page,
            brief: result.data.content_brief,
          },
          status: 'draft',
        });
      }

      // Insert artifacts
      for (const artifact of artifactsToCreate) {
        await db.insert(artifacts).values(artifact);
      }

      // Create a recommendation summarizing the optimizations
      const [rec] = await db.insert(recommendations).values({
        brand_id: brandId,
        job_id: jobId,
        source: 'content_optimizer',
        priority: result.data.priority,
        title: `Content optimizations available for ${page.page}`,
        body: `Generated ${result.data.title_variants.length} title variants and ${result.data.meta_descriptions.length} meta descriptions. ${result.data.estimated_impact}`,
        data: {
          page_url: page.page,
          artifact_count: artifactsToCreate.length,
          optimization_types: artifactsToCreate.map((a) => a.type),
        },
        model_meta: result.model_meta,
      }).returning();

      await emitEvent(
        EventType.RECOMMENDATION_CREATED,
        brandId,
        { recommendation_id: rec.id, source: 'content_optimizer', priority: result.data.priority },
        `content:${page.page}:${new Date().toISOString().slice(0, 10)}`,
        'content_optimizer',
      );

      logger.info({ jobId, brandId, page: page.page, artifactCount: artifactsToCreate.length }, 'Page optimization complete');
    } catch (err) {
      logger.error({ err, jobId, brandId, page: page.page }, 'Failed to optimize page');
    }
  }

  logger.info({ jobId, brandId, pagesOptimized: pagesToOptimize.length }, 'Content optimization complete');
}

/**
 * Get underperforming pages to optimize.
 * In production, this would query real GSC data.
 * For now, returns simulated data based on criteria:
 * - High impressions but low CTR
 * - Position 5-20 (opportunity zone)
 */
async function getUnderperformingPages(
  db: JobContext['db'],
  brandId: string,
  payload: Record<string, unknown>,
): Promise<GscPageData[]> {
  // Check if specific pages passed in payload
  if (payload.pages && Array.isArray(payload.pages)) {
    return payload.pages as GscPageData[];
  }

  // Simulate underperforming pages
  // In production, this would:
  // 1. Load GSC credentials
  // 2. Query GSC API for pages with high impressions, low CTR, position 5-20
  // 3. Return actual data

  return [
    {
      page: 'https://example.com/blog/getting-started',
      clicks: 45,
      impressions: 2500,
      ctr: 0.018, // 1.8% - below average
      position: 8.3,
    },
    {
      page: 'https://example.com/features/analytics',
      clicks: 120,
      impressions: 5000,
      ctr: 0.024, // 2.4% - could be better
      position: 6.1,
    },
    {
      page: 'https://example.com/pricing',
      clicks: 200,
      impressions: 8000,
      ctr: 0.025, // 2.5% - high volume, worth optimizing
      position: 4.8,
    },
  ];
}
