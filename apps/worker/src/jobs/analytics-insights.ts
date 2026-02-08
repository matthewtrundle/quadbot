import { analyticsInsightsOutputSchema } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType, IntegrationType } from '@quadbot/shared';
import {
  getValidGa4AccessToken,
  getGa4AnalyticsData,
} from '../lib/google-analytics-api.js';

/**
 * Analytics Insights Job
 *
 * Analyzes Google Analytics 4 data and generates:
 * - User behavior insights
 * - Conversion optimization recommendations
 * - Top pages and exit page analysis
 *
 * Triggered: Daily at 8:45 AM (after GSC and Ads digests)
 */
export async function analyticsInsights(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Check for Google Analytics integration
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, IntegrationType.GOOGLE_ANALYTICS),
      ),
    )
    .limit(1);

  if (!integration) {
    logger.info({ jobId, brandId }, 'No Google Analytics integration, skipping');
    return;
  }

  // Load prompt
  let prompt;
  try {
    prompt = await loadActivePrompt('analytics_insights_v1');
  } catch {
    logger.warn({ jobId }, 'Analytics insights prompt not found, skipping');
    return;
  }

  // Get real analytics data - skip if unavailable
  const credentials = await getValidGa4AccessToken(db, brandId);

  if (!credentials) {
    logger.info({ jobId, brandId }, 'No Google Analytics credentials available, skipping');
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

  const [analyticsData, analyticsPreviousData] = await Promise.all([
    getGa4AnalyticsData(credentials.accessToken, credentials.propertyId, {
      start: formatDate(startDate),
      end: formatDate(endDate),
    }),
    getGa4AnalyticsData(credentials.accessToken, credentials.propertyId, {
      start: formatDate(previousStartDate),
      end: formatDate(previousEndDate),
    }),
  ]);

  if (!analyticsData || !analyticsPreviousData) {
    logger.error({ jobId, brandId }, 'Google Analytics API failed, skipping job');
    return;
  }

  logger.info({ jobId, brandId }, 'Retrieved real Google Analytics data');

  const result = await callClaude(
    prompt,
    {
      brand_name: brand[0].name,
      analytics_data: JSON.stringify(analyticsData),
      analytics_previous_data: JSON.stringify(analyticsPreviousData),
      conversion_goals: JSON.stringify({
        primary: 'sign_up',
        secondary: ['demo_request', 'newsletter_subscribe'],
      }),
    },
    analyticsInsightsOutputSchema,
  );

  // Create summary recommendation
  const [summaryRec] = await db.insert(recommendations).values({
    brand_id: brandId,
    job_id: jobId,
    source: 'analytics_insights',
    priority: 'medium',
    title: 'Google Analytics Weekly Insights',
    body: result.data.summary,
    data: {
      key_metrics: result.data.key_metrics,
      top_pages: result.data.top_pages,
      recommendations_count: result.data.recommendations.length,
    },
    model_meta: result.model_meta,
  }).returning();

  await emitEvent(
    EventType.RECOMMENDATION_CREATED,
    brandId,
    { recommendation_id: summaryRec.id, source: 'analytics_insights', priority: 'medium' },
    `analytics:summary:${new Date().toISOString().slice(0, 10)}`,
    'analytics_insights',
  );

  // Create individual recommendations
  for (const rec of result.data.recommendations) {
    const [inserted] = await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'analytics_insights',
      priority: rec.priority,
      title: rec.title,
      body: rec.description,
      data: { type: rec.type },
      model_meta: result.model_meta,
    }).returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: inserted.id, source: 'analytics_insights', priority: rec.priority },
      `analytics:rec:${inserted.id}`,
      'analytics_insights',
    );
  }

  logger.info(
    { jobId, brandId, recommendationsCount: result.data.recommendations.length },
    'Analytics insights complete',
  );
}

