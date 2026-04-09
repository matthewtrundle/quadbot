/**
 * Seasonal Content Planner Job
 *
 * Analyzes historical GSC search analytics data to detect seasonal trends,
 * identifies upcoming peak periods, and generates content recommendations.
 *
 * Uses Claude AI to analyze patterns and suggest content strategies.
 *
 * Triggered: Weekly (configured in cron.ts)
 */

import { brands, brandIntegrations, metricSnapshots, recommendations, seasonalTopics } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { trackDirectApiCall } from '../claude.js';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import { loadGscCredentials, refreshAccessToken, type GscTokens } from '../lib/gsc-api.js';
import { persistRefreshedTokens } from '../lib/token-persistence.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SeasonalPattern {
  query: string;
  monthlyVolumes: { month: number; clicks: number; impressions: number }[];
  peakMonth: number;
  troughMonth: number;
  seasonalityIndex: number; // ratio of peak to average
}

interface ClaudeSeasonalInsight {
  topic: string;
  category: 'holiday' | 'seasonal' | 'industry_event' | 'trending';
  peak_month: number;
  peak_start_week: number;
  peak_end_week: number;
  recommended_publish_weeks_before: number;
  content_suggestions: string[];
  target_keywords: string[];
  priority_score: number;
}

interface GscSearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMonthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || 'Unknown';
}

/**
 * Get a valid GSC access token, refreshing and persisting if expired.
 */
async function getValidGscToken(db: JobContext['db'], brandId: string, credentials: GscTokens): Promise<string> {
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

/**
 * Fetch GSC search analytics with multiple dimensions (query + date).
 * Uses the raw API since the shared helper only supports a single dimension.
 */
async function fetchGscSearchAnalyticsMultiDimension(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 5000,
): Promise<GscSearchAnalyticsRow[]> {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GSC Search Analytics API failed: ${error}`);
  }

  const data = (await response.json()) as {
    rows?: GscSearchAnalyticsRow[];
  };

  return data.rows || [];
}

function detectSeasonalPatterns(rows: GscSearchAnalyticsRow[]): SeasonalPattern[] {
  // Group by query and month
  const queryMonthlyData = new Map<string, Map<number, { clicks: number; impressions: number }>>();

  for (const row of rows) {
    const query = row.keys[0]; // First key is the query
    const dateStr = row.keys[1]; // Second key is the date
    if (!query || !dateStr) continue;

    const date = new Date(dateStr);
    const month = date.getMonth() + 1; // 1-12

    if (!queryMonthlyData.has(query)) {
      queryMonthlyData.set(query, new Map());
    }
    const monthMap = queryMonthlyData.get(query)!;
    const existing = monthMap.get(month) || { clicks: 0, impressions: 0 };
    monthMap.set(month, {
      clicks: existing.clicks + row.clicks,
      impressions: existing.impressions + row.impressions,
    });
  }

  const patterns: SeasonalPattern[] = [];

  for (const [query, monthMap] of queryMonthlyData) {
    if (monthMap.size < 4) continue; // Need at least 4 months of data

    const monthlyVolumes: { month: number; clicks: number; impressions: number }[] = [];
    let totalClicks = 0;
    let peakMonth = 1;
    let peakClicks = 0;
    let troughMonth = 1;
    let troughClicks = Infinity;

    for (let m = 1; m <= 12; m++) {
      const data = monthMap.get(m) || { clicks: 0, impressions: 0 };
      monthlyVolumes.push({ month: m, ...data });
      totalClicks += data.clicks;

      if (data.clicks > peakClicks) {
        peakClicks = data.clicks;
        peakMonth = m;
      }
      if (data.clicks < troughClicks && data.clicks > 0) {
        troughClicks = data.clicks;
        troughMonth = m;
      }
    }

    const avgClicks = totalClicks / monthMap.size;
    if (avgClicks < 5) continue; // Skip very low volume queries

    const seasonalityIndex = avgClicks > 0 ? peakClicks / avgClicks : 1;

    // Only include queries with clear seasonal patterns (peak is 2x+ average)
    if (seasonalityIndex >= 2.0) {
      patterns.push({
        query,
        monthlyVolumes,
        peakMonth,
        troughMonth,
        seasonalityIndex,
      });
    }
  }

  // Sort by seasonality index (most seasonal first) and take top 30
  return patterns.sort((a, b) => b.seasonalityIndex - a.seasonalityIndex).slice(0, 30);
}

async function analyzeWithClaude(
  brandName: string,
  industry: string,
  patterns: SeasonalPattern[],
  currentMonth: number,
  trackCtx?: { db: import('@quadbot/db').Database; brandId: string; jobId: string },
): Promise<ClaudeSeasonalInsight[]> {
  const anthropic = new Anthropic();

  const patternSummary = patterns
    .slice(0, 20)
    .map((p) => {
      const volumeStr = p.monthlyVolumes
        .filter((v) => v.clicks > 0)
        .map((v) => `${getMonthName(v.month)}: ${v.clicks} clicks`)
        .join(', ');
      return `- "${p.query}" — Peak: ${getMonthName(p.peakMonth)}, Seasonality: ${p.seasonalityIndex.toFixed(1)}x avg [${volumeStr}]`;
    })
    .join('\n');

  const callStart = Date.now();
  const response = await anthropic.messages.create({
    model: 'claude-haiku-3-5-20241022',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `You are an SEO content strategist. Analyze these seasonal search patterns for "${brandName}" (${industry}) and generate content topic recommendations.

Current month: ${getMonthName(currentMonth)} (${currentMonth})

Historical seasonal patterns detected from Google Search Console data:
${patternSummary}

For each significant seasonal opportunity, provide a content topic recommendation. Focus on:
1. Topics where there's a clear seasonal peak coming in the next 1-4 months
2. Topics that align with the brand's industry
3. Group related queries into unified content topics
4. Assign priority based on volume, seasonality strength, and timing urgency

Respond with a JSON array of objects with these fields:
- topic: string (the content topic/article title suggestion)
- category: "holiday" | "seasonal" | "industry_event" | "trending"
- peak_month: number (1-12)
- peak_start_week: number (1-52, when interest starts rising)
- peak_end_week: number (1-52, when interest fades)
- recommended_publish_weeks_before: number (how many weeks before peak to publish)
- content_suggestions: string[] (2-4 specific content ideas/angles)
- target_keywords: string[] (3-8 target keywords)
- priority_score: number (0-100, higher = more urgent/impactful)

Return ONLY the JSON array, no other text.`,
      },
    ],
  });

  if (trackCtx) trackDirectApiCall(response, trackCtx, callStart);

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return [];

  try {
    const cleaned = textBlock.text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned) as ClaudeSeasonalInsight[];
  } catch {
    logger.warn('Failed to parse Claude seasonal analysis response');
    return [];
  }
}

// ─── Main Job ───────────────────────────────────────────────────────────────

export async function seasonalContentPlanner(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'seasonal_content_planner' }, 'Seasonal content planner starting');

  // 1. Load brand and check module enablement
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('seasonal_content')) {
    logger.info({ jobId, brandId }, 'seasonal_content module not enabled, skipping');
    return;
  }

  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;
  const industry = (guardrails.industry as string) || 'business';

  // 2. Try to fetch 12 months of GSC data for seasonal analysis
  let gscRows: GscSearchAnalyticsRow[] = [];

  try {
    const creds = await loadGscCredentials(db, brandId);
    if (creds) {
      const token = await getValidGscToken(db, brandId, creds);
      const siteUrl = await getGscSiteUrl(db, brandId);

      if (siteUrl) {
        // Fetch last 12 months of data, grouped by query and date
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        gscRows = await fetchGscSearchAnalyticsMultiDimension(
          token,
          siteUrl,
          startStr,
          endStr,
          ['query', 'date'],
          5000,
        );
        logger.info({ jobId, brandId, rowCount: gscRows.length }, 'Fetched GSC data for seasonal analysis');
      } else {
        logger.warn({ jobId, brandId }, 'No GSC site URL configured');
      }
    }
  } catch (err) {
    logger.warn({ jobId, brandId, err: (err as Error).message }, 'Could not fetch GSC data, using fallback analysis');
  }

  // 3. Detect seasonal patterns
  let patterns: SeasonalPattern[] = [];

  if (gscRows.length > 0) {
    patterns = detectSeasonalPatterns(gscRows);
    logger.info({ jobId, brandId, patternsFound: patterns.length }, 'Seasonal patterns detected');
  }

  // 4. If we have patterns (or not), use Claude to generate insights
  const currentMonth = new Date().getMonth() + 1;
  const keywords = (guardrails.keywords as string[]) || [];

  // If no GSC data, create synthetic patterns from keywords for Claude to work with
  if (patterns.length === 0 && keywords.length > 0) {
    logger.info({ jobId, brandId }, 'No GSC seasonal data, using keyword-based analysis');
    patterns = keywords.slice(0, 10).map((kw) => ({
      query: kw,
      monthlyVolumes: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        clicks: 0,
        impressions: 0,
      })),
      peakMonth: currentMonth,
      troughMonth: ((currentMonth + 5) % 12) + 1,
      seasonalityIndex: 1.0,
    }));
  }

  if (patterns.length === 0) {
    logger.info({ jobId, brandId }, 'No patterns or keywords to analyze, skipping');
    return;
  }

  const insights = await analyzeWithClaude(brand.name, industry, patterns, currentMonth, { db, brandId, jobId });
  logger.info({ jobId, brandId, insightsCount: insights.length }, 'Claude seasonal insights generated');

  // 5. Store seasonal topics
  let newTopics = 0;

  for (const insight of insights) {
    try {
      await db.insert(seasonalTopics).values({
        brand_id: brandId,
        topic: insight.topic,
        category: insight.category,
        peak_month: insight.peak_month,
        peak_start_week: insight.peak_start_week,
        peak_end_week: insight.peak_end_week,
        recommended_publish_weeks_before: insight.recommended_publish_weeks_before,
        content_suggestions: insight.content_suggestions,
        target_keywords: insight.target_keywords,
        competitor_coverage: [],
        priority_score: insight.priority_score,
        source: gscRows.length > 0 ? 'gsc_historical' : 'auto',
      });
      newTopics++;
    } catch (err) {
      logger.warn({ jobId, topic: insight.topic, err: (err as Error).message }, 'Failed to insert seasonal topic');
    }
  }

  // 6. Store metrics
  const now = new Date();
  const upcomingTopics = insights.filter((i) => {
    const monthsUntilPeak = (i.peak_month - currentMonth + 12) % 12 || 12;
    return monthsUntilPeak <= 3;
  });

  const metricsToStore = [
    { metric_key: 'seasonal_topics_detected', value: insights.length },
    { metric_key: 'seasonal_upcoming_3mo', value: upcomingTopics.length },
    {
      metric_key: 'seasonal_avg_priority',
      value: insights.length > 0 ? insights.reduce((s, i) => s + i.priority_score, 0) / insights.length : 0,
    },
  ];

  for (const metric of metricsToStore) {
    await db.insert(metricSnapshots).values({
      brand_id: brandId,
      source: 'seasonal',
      metric_key: metric.metric_key,
      value: metric.value,
      captured_at: now,
    });
  }

  // 7. Generate recommendations for urgent topics
  const urgentTopics = upcomingTopics.filter((t) => t.priority_score >= 70);

  if (urgentTopics.length > 0) {
    const topicList = urgentTopics.map((t) => `"${t.topic}" (peaks ${getMonthName(t.peak_month)})`).join(', ');

    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'seasonal_content_planner',
        priority: urgentTopics.some((t) => t.priority_score >= 90) ? 'high' : 'medium',
        title: `${urgentTopics.length} seasonal content ${urgentTopics.length === 1 ? 'opportunity' : 'opportunities'} approaching peak`,
        body: `The following seasonal topics are approaching their peak search period and should be published soon: ${topicList}. Publishing content 3-6 weeks before peak demand ensures it's indexed and ranking when search volume surges. Check the Seasonal Content Planner for detailed recommendations.`,
        data: {
          urgent_topic_count: urgentTopics.length,
          topics: urgentTopics.map((t) => ({ topic: t.topic, peak_month: t.peak_month, priority: t.priority_score })),
        },
      })
      .returning();

    await emitEvent(
      EventType.SEASONAL_TOPIC_DETECTED,
      brandId,
      {
        recommendation_id: rec.id,
        urgent_count: urgentTopics.length,
        topics: urgentTopics.map((t) => t.topic),
      },
      `seasonal:urgent:${now.toISOString().slice(0, 10)}`,
      'seasonal_content_planner',
    );
  }

  // 8. Emit general seasonal topics event
  for (const insight of insights.slice(0, 5)) {
    await emitEvent(
      EventType.SEASONAL_TOPIC_DETECTED,
      brandId,
      {
        topic: insight.topic,
        peak_month: insight.peak_month,
        category: insight.category,
        priority_score: insight.priority_score,
      },
      `seasonal:topic:${insight.topic.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`,
      'seasonal_content_planner',
    );
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'seasonal_content_planner',
      newTopics,
      totalInsights: insights.length,
      urgentTopics: urgentTopics?.length || 0,
      durationMs: Date.now() - startTime,
    },
    'Seasonal content planner completed',
  );
}
