import { adsPerformanceOutputSchema } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType, IntegrationType } from '@quadbot/shared';
import {
  getValidAdsAccessToken,
  getAdsPerformance,
} from '../lib/google-ads-api.js';

/**
 * Ads Performance Digest Job
 *
 * Analyzes Google Ads campaign data and generates:
 * - Campaign performance summaries
 * - Budget allocation recommendations
 * - Optimization opportunities
 *
 * Triggered: Daily at 8:30 AM (after GSC digest)
 */
export async function adsPerformanceDigest(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Check for Google Ads integration
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, IntegrationType.GOOGLE_ADS),
      ),
    )
    .limit(1);

  if (!integration) {
    logger.info({ jobId, brandId }, 'No Google Ads integration, skipping');
    return;
  }

  // Load prompt
  let prompt;
  try {
    prompt = await loadActivePrompt('ads_performance_digest_v1');
  } catch {
    logger.warn({ jobId }, 'Ads performance digest prompt not found, skipping');
    return;
  }

  // Get real ads data - skip if unavailable
  const credentials = await getValidAdsAccessToken(db, brandId);

  if (!credentials) {
    logger.info({ jobId, brandId }, 'No Google Ads credentials available, skipping');
    return;
  }

  // Calculate date ranges
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() - 1); // Yesterday
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6); // 7 days ago

  const previousEndDate = new Date(startDate);
  previousEndDate.setDate(previousEndDate.getDate() - 1);
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setDate(previousStartDate.getDate() - 6);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const [adsData, adsPreviousData] = await Promise.all([
    getAdsPerformance(credentials.accessToken, credentials.customerId, {
      start: formatDate(startDate),
      end: formatDate(endDate),
    }),
    getAdsPerformance(credentials.accessToken, credentials.customerId, {
      start: formatDate(previousStartDate),
      end: formatDate(previousEndDate),
    }),
  ]);

  if (!adsData || !adsPreviousData) {
    logger.error({ jobId, brandId }, 'Google Ads API failed, skipping job');
    return;
  }

  logger.info({ jobId, brandId }, 'Retrieved real Google Ads data');

  const result = await callClaude(
    prompt,
    {
      brand_name: brand[0].name,
      ads_data: JSON.stringify(adsData),
      ads_previous_data: JSON.stringify(adsPreviousData),
      account_goals: JSON.stringify({ target_roas: 4.0, monthly_budget: 10000 }),
    },
    adsPerformanceOutputSchema,
  );

  // Create summary recommendation
  const [summaryRec] = await db.insert(recommendations).values({
    brand_id: brandId,
    job_id: jobId,
    source: 'ads_performance_digest',
    priority: 'medium',
    title: 'Google Ads Weekly Performance',
    body: result.data.summary,
    data: {
      top_campaigns: result.data.top_campaigns,
      recommendations_count: result.data.recommendations.length,
    },
    model_meta: result.model_meta,
  }).returning();

  await emitEvent(
    EventType.RECOMMENDATION_CREATED,
    brandId,
    { recommendation_id: summaryRec.id, source: 'ads_performance_digest', priority: 'medium' },
    `ads:summary:${new Date().toISOString().slice(0, 10)}`,
    'ads_performance_digest',
  );

  // Create individual recommendations
  for (const rec of result.data.recommendations) {
    const [inserted] = await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'ads_performance_digest',
      priority: rec.priority,
      title: rec.title,
      body: rec.description,
      data: { type: rec.type },
      model_meta: result.model_meta,
    }).returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: inserted.id, source: 'ads_performance_digest', priority: rec.priority },
      `ads:rec:${inserted.id}`,
      'ads_performance_digest',
    );
  }

  logger.info(
    { jobId, brandId, recommendationsCount: result.data.recommendations.length },
    'Ads performance digest complete',
  );
}

