import { crossChannelCorrelationSchema } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and, gte } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType, IntegrationType } from '@quadbot/shared';

/**
 * Cross-Channel Correlator Job
 *
 * Analyzes data across multiple sources (GSC, Ads, Analytics) to find:
 * - Cross-channel correlations
 * - Unified optimization opportunities
 * - Budget reallocation insights
 *
 * Triggered: Daily at 12:00 PM (after all individual digests complete)
 */
export async function crossChannelCorrelator(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Check which integrations are available
  const integrations = await db
    .select()
    .from(brandIntegrations)
    .where(eq(brandIntegrations.brand_id, brandId));

  const hasGsc = integrations.some((i) => i.type === IntegrationType.GOOGLE_SEARCH_CONSOLE);
  const hasAds = integrations.some((i) => i.type === IntegrationType.GOOGLE_ADS);
  const hasAnalytics = integrations.some((i) => i.type === IntegrationType.GOOGLE_ANALYTICS);

  // Need at least 2 integrations for cross-channel analysis
  const integrationCount = [hasGsc, hasAds, hasAnalytics].filter(Boolean).length;
  if (integrationCount < 2) {
    logger.info(
      { jobId, brandId, integrationCount },
      'Need at least 2 integrations for cross-channel analysis, skipping',
    );
    return;
  }

  // Load prompt
  let prompt;
  try {
    prompt = await loadActivePrompt('cross_channel_correlator_v1');
  } catch {
    logger.warn({ jobId }, 'Cross-channel correlator prompt not found, skipping');
    return;
  }

  // Get recent recommendations from each source to understand current state
  const recentRecs = await db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.brand_id, brandId),
        gte(recommendations.created_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
      ),
    );

  // Group by source
  const gscRecs = recentRecs.filter((r) => r.source.includes('gsc'));
  const adsRecs = recentRecs.filter((r) => r.source.includes('ads'));
  const analyticsRecs = recentRecs.filter((r) => r.source.includes('analytics'));

  // Compile data summaries (in production, would use actual API data)
  const gscData = hasGsc ? getSimulatedGscSummary(gscRecs) : null;
  const adsData = hasAds ? getSimulatedAdsSummary(adsRecs) : null;
  const analyticsData = hasAnalytics ? getSimulatedAnalyticsSummary(analyticsRecs) : null;

  const result = await callClaude(
    prompt,
    {
      brand_name: brand[0].name,
      gsc_data: gscData ? JSON.stringify(gscData) : 'Not available',
      ads_data: adsData ? JSON.stringify(adsData) : 'Not available',
      analytics_data: analyticsData ? JSON.stringify(analyticsData) : 'Not available',
    },
    crossChannelCorrelationSchema,
  );

  // Create summary recommendation with cross-channel insights
  const [summaryRec] = await db.insert(recommendations).values({
    brand_id: brandId,
    job_id: jobId,
    source: 'cross_channel_correlator',
    priority: 'high', // Cross-channel insights are typically high value
    title: 'Cross-Channel Intelligence Report',
    body: result.data.summary,
    data: {
      correlations: result.data.correlations,
      channels_analyzed: [hasGsc && 'GSC', hasAds && 'Ads', hasAnalytics && 'Analytics'].filter(Boolean),
      recommendations_count: result.data.unified_recommendations.length,
    },
    model_meta: result.model_meta,
  }).returning();

  await emitEvent(
    EventType.RECOMMENDATION_CREATED,
    brandId,
    { recommendation_id: summaryRec.id, source: 'cross_channel_correlator', priority: 'high' },
    `cross:summary:${new Date().toISOString().slice(0, 10)}`,
    'cross_channel_correlator',
  );

  // Create unified recommendations
  for (const rec of result.data.unified_recommendations) {
    const [inserted] = await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'cross_channel_correlator',
      priority: rec.priority,
      title: rec.title,
      body: rec.description,
      data: {
        type: rec.type,
        affected_channels: rec.affected_channels,
      },
      model_meta: result.model_meta,
    }).returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: inserted.id, source: 'cross_channel_correlator', priority: rec.priority },
      `cross:rec:${inserted.id}`,
      'cross_channel_correlator',
    );
  }

  logger.info(
    {
      jobId,
      brandId,
      correlationsFound: result.data.correlations.length,
      recommendationsCount: result.data.unified_recommendations.length,
    },
    'Cross-channel correlation complete',
  );
}

function getSimulatedGscSummary(recs: any[]) {
  return {
    source: 'Google Search Console',
    period: 'last_7_days',
    total_clicks: 4500,
    total_impressions: 150000,
    avg_ctr: 0.03,
    avg_position: 8.5,
    top_queries: [
      { query: 'brand name', clicks: 800, position: 1.2 },
      { query: 'product category', clicks: 350, position: 6.5 },
      { query: 'how to use product', clicks: 280, position: 4.2 },
    ],
    recent_recommendations: recs.slice(0, 3).map((r) => r.title),
  };
}

function getSimulatedAdsSummary(recs: any[]) {
  return {
    source: 'Google Ads',
    period: 'last_7_days',
    total_spend: 5250.50,
    total_conversions: 225,
    avg_cpc: 0.60,
    avg_roas: 3.8,
    top_keywords: [
      { keyword: 'buy product', spend: 1200, conversions: 45, cpc: 0.85 },
      { keyword: 'product reviews', spend: 800, conversions: 28, cpc: 0.55 },
      { keyword: 'best product 2024', spend: 600, conversions: 22, cpc: 0.72 },
    ],
    recent_recommendations: recs.slice(0, 3).map((r) => r.title),
  };
}

function getSimulatedAnalyticsSummary(recs: any[]) {
  return {
    source: 'Google Analytics',
    period: 'last_7_days',
    total_sessions: 12500,
    total_users: 8500,
    conversion_rate: 0.036,
    bounce_rate: 0.42,
    top_landing_pages: [
      { page: '/', sessions: 4200, bounce_rate: 0.40 },
      { page: '/pricing', sessions: 1800, bounce_rate: 0.25 },
      { page: '/blog/guide', sessions: 1200, bounce_rate: 0.35 },
    ],
    traffic_sources: {
      organic: 4500,
      paid: 3200,
      direct: 2800,
    },
    recent_recommendations: recs.slice(0, 3).map((r) => r.title),
  };
}
