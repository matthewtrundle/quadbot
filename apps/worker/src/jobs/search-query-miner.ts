import { recommendations, brands, metricSnapshots } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import Anthropic from '@anthropic-ai/sdk';
import { trackDirectApiCall } from '../claude.js';
import { loadGscCredentials, refreshAccessToken, fetchGscSearchAnalytics } from '../lib/gsc-api.js';
import { persistRefreshedTokens } from '../lib/token-persistence.js';
import { brandIntegrations } from '@quadbot/db';
import { and } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

type QueryOpportunity = {
  query: string;
  type: 'optimize_position' | 'improve_ctr' | 'new_content';
  current_position: number;
  impressions: number;
  ctr: number;
  potential_traffic_gain: number;
  recommendation: string;
};

type NegativeKeyword = {
  query: string;
  reason: string;
  wasted_clicks_estimate: number;
};

type QueryCluster = {
  theme: string;
  queries: string[];
  total_impressions: number;
  content_suggestion: string;
};

type MinerAnalysis = {
  opportunities: QueryOpportunity[];
  negative_keywords: NegativeKeyword[];
  clusters: QueryCluster[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get a valid GSC access token, refreshing and persisting if expired.
 */
async function getValidGscToken(
  db: JobContext['db'],
  brandId: string,
  credentials: { access_token: string; refresh_token: string; expires_at: string },
): Promise<string> {
  const expiresAt = new Date(credentials.expires_at);
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > Date.now()) {
    return credentials.access_token;
  }

  logger.info({ brandId }, 'Refreshing expired GSC access token');
  const freshTokens = await refreshAccessToken(credentials.refresh_token);
  await persistRefreshedTokens(db, brandId, 'google_search_console', freshTokens);
  return freshTokens.access_token;
}

/**
 * Get the GSC site URL from brand integration config.
 */
async function getGscSiteUrl(db: JobContext['db'], brandId: string): Promise<string | null> {
  const [integration] = await db
    .select({ config: brandIntegrations.config })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'google_search_console')))
    .limit(1);

  const config = integration?.config as Record<string, unknown> | undefined;
  return (config?.siteUrl as string) || (config?.site_url as string) || null;
}

// ─── Main Job ───────────────────────────────────────────────────────────────

/**
 * Search Query Miner
 *
 * Analyzes GSC search query data to find optimization opportunities,
 * negative keyword candidates, and query clusters.
 *
 * Steps:
 * 1. Load brand, check 'search_query_mining' module enabled
 * 2. Load GSC credentials
 * 3. Fetch GSC search analytics for last 28 days
 * 4. Use Claude to analyze query data
 * 5. Store metrics
 * 6. Create recommendations for top 5 opportunities
 * 7. Emit SEARCH_QUERY_OPPORTUNITY event
 */
export async function searchQueryMiner(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'search_query_miner' }, 'Search_Query_Miner starting');

  // 1. Load brand and check module
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('search_query_mining')) {
    logger.info({ jobId, brandId }, 'search_query_mining module not enabled, skipping');
    return;
  }

  // 2. Load GSC credentials
  const credentials = await loadGscCredentials(db, brandId);
  const siteUrl = await getGscSiteUrl(db, brandId);

  if (!credentials || !siteUrl) {
    logger.info(
      { jobId, brandId, hasCredentials: !!credentials, hasSiteUrl: !!siteUrl },
      'No GSC credentials or site URL — skipping search query mining',
    );
    return;
  }

  // 3. Fetch GSC search analytics for last 28 days
  let queryData;
  try {
    const accessToken = await getValidGscToken(db, brandId, credentials);

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 3); // GSC data has ~3-day lag
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 27); // 28-day window

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    queryData = await fetchGscSearchAnalytics(accessToken, siteUrl, fmt(startDate), fmt(endDate));

    logger.info(
      {
        jobId,
        brandId,
        siteUrl,
        dateRange: `${fmt(startDate)}..${fmt(endDate)}`,
        rowCount: queryData.length,
      },
      'Fetched GSC query data for mining',
    );
  } catch (err) {
    logger.warn(
      { jobId, brandId, err: (err as Error).message },
      'Failed to fetch GSC data — skipping search query mining',
    );
    return;
  }

  if (queryData.length === 0) {
    logger.info({ jobId, brandId }, 'No GSC query data found, skipping');
    return;
  }

  // 4. Analyze query data with Claude
  const brandName = brand.name;
  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;
  const industry = (guardrails.industry as string) || 'unknown';

  const queryDataSummary = queryData
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 200) // Limit to top 200 by impressions to fit context
    .map((q) => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: Math.round(q.ctr * 10000) / 100, // Convert to percentage
      position: Math.round(q.position * 10) / 10,
    }));

  const prompt = `Analyze these GSC search queries for the brand "${brandName}" (industry: ${industry}):

${JSON.stringify(queryDataSummary, null, 2)}

Identify:
- High-potential queries (good impressions but low CTR or low position) that could be optimized
- Queries with high clicks but irrelevant to the brand (negative keyword candidates for Ads)
- Query clusters (related queries that could be addressed with a single content piece)
- For each opportunity, estimate potential traffic gain

Return JSON only (no markdown fences):
{
  "opportunities": [{ "query": "...", "type": "optimize_position|improve_ctr|new_content", "current_position": 15, "impressions": 500, "ctr": 0.02, "potential_traffic_gain": 50, "recommendation": "..." }],
  "negative_keywords": [{ "query": "...", "reason": "...", "wasted_clicks_estimate": 10 }],
  "clusters": [{ "theme": "...", "queries": ["..."], "total_impressions": 1000, "content_suggestion": "..." }]
}`;

  const anthropic = new Anthropic();
  let analysis: MinerAnalysis;

  try {
    const callStart = Date.now();
    const response = await anthropic.messages.create({
      model: 'claude-haiku-3-5-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    trackDirectApiCall(response, { db, brandId, jobId }, callStart);

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonText);

    analysis = {
      opportunities: Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map((o: Record<string, unknown>) => ({
            query: String(o.query || ''),
            type: (['optimize_position', 'improve_ctr', 'new_content'].includes(String(o.type))
              ? String(o.type)
              : 'optimize_position') as QueryOpportunity['type'],
            current_position: Number(o.current_position) || 0,
            impressions: Number(o.impressions) || 0,
            ctr: Number(o.ctr) || 0,
            potential_traffic_gain: Number(o.potential_traffic_gain) || 0,
            recommendation: String(o.recommendation || ''),
          }))
        : [],
      negative_keywords: Array.isArray(parsed.negative_keywords)
        ? parsed.negative_keywords.map((n: Record<string, unknown>) => ({
            query: String(n.query || ''),
            reason: String(n.reason || ''),
            wasted_clicks_estimate: Number(n.wasted_clicks_estimate) || 0,
          }))
        : [],
      clusters: Array.isArray(parsed.clusters)
        ? parsed.clusters.map((c: Record<string, unknown>) => ({
            theme: String(c.theme || ''),
            queries: Array.isArray(c.queries) ? c.queries.map(String) : [],
            total_impressions: Number(c.total_impressions) || 0,
            content_suggestion: String(c.content_suggestion || ''),
          }))
        : [],
    };

    logger.info(
      {
        jobId,
        brandId,
        opportunities: analysis.opportunities.length,
        negativeKeywords: analysis.negative_keywords.length,
        clusters: analysis.clusters.length,
      },
      'Claude query mining analysis complete',
    );
  } catch (err) {
    logger.error({ jobId, brandId, err: (err as Error).message }, 'Failed to get or parse Claude response');
    throw err;
  }

  // 5. Store metrics
  await db.insert(metricSnapshots).values([
    {
      brand_id: brandId,
      source: 'search_query_miner',
      metric_key: 'query_opportunities_found',
      value: analysis.opportunities.length,
    },
    {
      brand_id: brandId,
      source: 'search_query_miner',
      metric_key: 'negative_keywords_found',
      value: analysis.negative_keywords.length,
    },
    {
      brand_id: brandId,
      source: 'search_query_miner',
      metric_key: 'query_clusters_found',
      value: analysis.clusters.length,
    },
  ]);

  // 6. Create recommendations for top 5 opportunities
  const topOpportunities = analysis.opportunities
    .sort((a, b) => b.potential_traffic_gain - a.potential_traffic_gain)
    .slice(0, 5);

  for (const opp of topOpportunities) {
    const priority = opp.potential_traffic_gain > 100 ? 'high' : opp.potential_traffic_gain > 30 ? 'medium' : 'low';

    const typeLabel =
      opp.type === 'optimize_position'
        ? 'Position Optimization'
        : opp.type === 'improve_ctr'
          ? 'CTR Improvement'
          : 'New Content Opportunity';

    const body = `**Query:** "${opp.query}"
**Type:** ${typeLabel}
**Current Position:** ${opp.current_position}
**Impressions (28d):** ${opp.impressions}
**Current CTR:** ${Math.round(opp.ctr * 10000) / 100}%
**Potential Traffic Gain:** +${opp.potential_traffic_gain} clicks/month

**Recommendation:** ${opp.recommendation}`;

    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'search_query_miner',
        priority,
        title: `${typeLabel}: "${opp.query}"`,
        body,
        data: {
          query: opp.query,
          opportunity_type: opp.type,
          current_position: opp.current_position,
          impressions: opp.impressions,
          ctr: opp.ctr,
          potential_traffic_gain: opp.potential_traffic_gain,
        },
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'search_query_miner', priority },
      `query-miner:rec:${rec.id}`,
      'search_query_miner',
    );
  }

  // 7. Emit SEARCH_QUERY_OPPORTUNITY event
  const totalPotentialGain = analysis.opportunities.reduce((sum, o) => sum + o.potential_traffic_gain, 0);

  await emitEvent(
    EventType.SEARCH_QUERY_OPPORTUNITY,
    brandId,
    {
      opportunities_found: analysis.opportunities.length,
      negative_keywords_found: analysis.negative_keywords.length,
      clusters_found: analysis.clusters.length,
      total_potential_traffic_gain: totalPotentialGain,
      top_query: topOpportunities[0]?.query,
    },
    `query-miner:${brandId}:${new Date().toISOString().split('T')[0]}`,
    'search_query_miner',
  );

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'search_query_miner',
      opportunities: analysis.opportunities.length,
      negativeKeywords: analysis.negative_keywords.length,
      clusters: analysis.clusters.length,
      totalPotentialGain,
      recommendationsCreated: topOpportunities.length,
      durationMs: Date.now() - startTime,
    },
    'Search_Query_Miner completed',
  );
}
