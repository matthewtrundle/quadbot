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

  // Compile data summaries from actual recommendations
  const gscData = hasGsc && gscRecs.length > 0 ? getGscSummary(gscRecs) : null;
  const adsData = hasAds && adsRecs.length > 0 ? getAdsSummary(adsRecs) : null;
  const analyticsData = hasAnalytics && analyticsRecs.length > 0 ? getAnalyticsSummary(analyticsRecs) : null;

  // Need at least some data to correlate
  if (!gscData && !adsData && !analyticsData) {
    logger.info({ jobId, brandId }, 'No recent recommendation data available for cross-channel analysis, skipping');
    return;
  }

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

function getGscSummary(recs: any[]) {
  // Extract metrics from recommendation data if available
  const summaryRec = recs.find((r) => r.source === 'gsc_daily_digest' && r.data);
  const metrics = summaryRec?.data || {};

  return {
    source: 'Google Search Console',
    period: 'last_7_days',
    metrics_available: !!summaryRec,
    top_queries: metrics.top_queries || [],
    recent_recommendations: recs.slice(0, 5).map((r) => ({
      title: r.title,
      priority: r.priority,
      created_at: r.created_at,
    })),
  };
}

function getAdsSummary(recs: any[]) {
  // Extract metrics from recommendation data if available
  const summaryRec = recs.find((r) => r.source === 'ads_performance_digest' && r.data);
  const metrics = summaryRec?.data || {};

  return {
    source: 'Google Ads',
    period: 'last_7_days',
    metrics_available: !!summaryRec,
    top_campaigns: metrics.top_campaigns || [],
    recent_recommendations: recs.slice(0, 5).map((r) => ({
      title: r.title,
      priority: r.priority,
      created_at: r.created_at,
    })),
  };
}

function getAnalyticsSummary(recs: any[]) {
  // Extract metrics from recommendation data if available
  const summaryRec = recs.find((r) => r.source === 'analytics_insights' && r.data);
  const metrics = summaryRec?.data || {};

  return {
    source: 'Google Analytics',
    period: 'last_7_days',
    metrics_available: !!summaryRec,
    key_metrics: metrics.key_metrics || {},
    top_pages: metrics.top_pages || [],
    recent_recommendations: recs.slice(0, 5).map((r) => ({
      title: r.title,
      priority: r.priority,
      created_at: r.created_at,
    })),
  };
}
