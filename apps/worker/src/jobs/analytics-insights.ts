import { analyticsInsightsOutputSchema } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType, IntegrationType } from '@quadbot/shared';

type AnalyticsCredentials = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

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

  // Load credentials (shared or direct)
  let credentials: AnalyticsCredentials | null = null;
  if (integration.shared_credential_id) {
    const [shared] = await db
      .select()
      .from(sharedCredentials)
      .where(eq(sharedCredentials.id, integration.shared_credential_id))
      .limit(1);
    if (shared) {
      credentials = JSON.parse(decrypt(shared.credentials_encrypted));
    }
  } else if (integration.credentials_encrypted) {
    credentials = JSON.parse(decrypt(integration.credentials_encrypted));
  }

  // Get analytics data (simulated for now)
  const analyticsData = getSimulatedAnalyticsData();
  const analyticsPreviousData = getSimulatedAnalyticsPreviousData();

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

function getSimulatedAnalyticsData() {
  return {
    period: 'last_7_days',
    sessions: 12500,
    users: 8500,
    new_users: 6200,
    bounce_rate: 0.42,
    avg_session_duration: 185,
    pages_per_session: 2.8,
    conversions: {
      sign_up: 450,
      demo_request: 85,
      newsletter_subscribe: 320,
    },
    top_pages: [
      { path: '/', views: 8500, avg_time: 45, bounce_rate: 0.40 },
      { path: '/pricing', views: 3200, avg_time: 120, bounce_rate: 0.25 },
      { path: '/features', views: 2800, avg_time: 90, bounce_rate: 0.35 },
      { path: '/blog/getting-started', views: 2100, avg_time: 180, bounce_rate: 0.30 },
      { path: '/contact', views: 1500, avg_time: 60, bounce_rate: 0.55 },
    ],
    traffic_sources: {
      organic: 4500,
      paid: 3200,
      direct: 2800,
      referral: 1200,
      social: 800,
    },
    device_breakdown: {
      desktop: 0.62,
      mobile: 0.32,
      tablet: 0.06,
    },
  };
}

function getSimulatedAnalyticsPreviousData() {
  return {
    period: 'prior_7_days',
    sessions: 11800,
    users: 8100,
    new_users: 5900,
    bounce_rate: 0.45,
    avg_session_duration: 175,
    pages_per_session: 2.6,
    conversions: {
      sign_up: 410,
      demo_request: 75,
      newsletter_subscribe: 290,
    },
    top_pages: [
      { path: '/', views: 8000, avg_time: 42, bounce_rate: 0.42 },
      { path: '/pricing', views: 2900, avg_time: 115, bounce_rate: 0.28 },
      { path: '/features', views: 2600, avg_time: 85, bounce_rate: 0.38 },
    ],
    traffic_sources: {
      organic: 4200,
      paid: 3000,
      direct: 2700,
      referral: 1100,
      social: 800,
    },
    device_breakdown: {
      desktop: 0.65,
      mobile: 0.30,
      tablet: 0.05,
    },
  };
}
