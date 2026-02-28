import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import { loadGscCredentials, refreshAccessToken, fetchGscSearchAnalytics, type GscTokens } from '../lib/gsc-api.js';
import { persistRefreshedTokens } from '../lib/token-persistence.js';
import { z } from 'zod';

type DecayingPage = {
  page: string;
  current_clicks: number;
  previous_clicks: number;
  clicks_delta_pct: number;
  current_impressions: number;
  previous_impressions: number;
  impressions_delta_pct: number;
  current_position: number;
  previous_position: number;
  position_delta: number;
  decay_score: number;
};

const decayAnalysisSchema = z.object({
  pages: z.array(
    z.object({
      page_url: z.string(),
      diagnosis: z.string(),
      refresh_actions: z.array(z.string()),
      priority: z.enum(['low', 'medium', 'high', 'critical']),
      estimated_recovery_weeks: z.number(),
    }),
  ),
  summary: z.string(),
});

/**
 * Calculate decay score for a page.
 * Higher score = more severe decay.
 */
export function calculateDecayScore(
  clicksDeltaPct: number,
  impressionsDeltaPct: number,
  positionDelta: number,
): number {
  // All deltas should be negative for decay; use absolute values
  return Math.abs(clicksDeltaPct) * 0.6 + Math.abs(impressionsDeltaPct) * 0.3 + Math.abs(positionDelta) * 0.1;
}

/**
 * Aggregate GSC row data by page dimension.
 */
function aggregateByPage(
  rows: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    position: number;
  }>,
): Map<string, { clicks: number; impressions: number; position: number; count: number }> {
  const pageMap = new Map<string, { clicks: number; impressions: number; position: number; count: number }>();

  for (const row of rows) {
    const page = row.keys[0];
    const existing = pageMap.get(page) || { clicks: 0, impressions: 0, position: 0, count: 0 };
    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.position += row.position;
    existing.count += 1;
    pageMap.set(page, existing);
  }

  // Average the position
  for (const [page, data] of pageMap) {
    if (data.count > 0) {
      data.position = data.position / data.count;
    }
  }

  return pageMap;
}

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
 * Content Decay Detector
 * Identifies pages with declining clicks and impressions, then uses Claude
 * to generate refresh recommendations.
 */
export async function contentDecayDetector(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'content_decay_detector' }, 'Content_Decay_Detector starting');

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('gsc_digest')) {
    logger.info({ jobId, brandId }, 'GSC module not enabled, skipping content decay detection');
    return;
  }

  const credentials = await loadGscCredentials(db, brandId);

  // Get site URL from integration config
  const [integration] = await db
    .select({ config: brandIntegrations.config })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'google_search_console')))
    .limit(1);

  const integrationConfig = integration?.config as Record<string, unknown> | undefined;
  const siteUrl = (integrationConfig?.siteUrl as string) || (integrationConfig?.site_url as string) || null;

  if (!credentials || !siteUrl) {
    logger.info({ jobId, brandId }, 'No GSC credentials or site URL, skipping');
    return;
  }

  let currentData: Array<{ keys: string[]; clicks: number; impressions: number; position: number }>;
  let previousData: Array<{ keys: string[]; clicks: number; impressions: number; position: number }>;

  try {
    const accessToken = await getValidGscToken(db, brandId, credentials);

    const today = new Date();
    // Current period: last 28 days (with 3-day lag)
    const currentEnd = new Date(today);
    currentEnd.setDate(currentEnd.getDate() - 3);
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() - 27);

    // Previous period: 28 days before current
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - 27);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const [rawCurrent, rawPrevious] = await Promise.all([
      fetchGscSearchAnalytics(accessToken, siteUrl, fmt(currentStart), fmt(currentEnd), 'page'),
      fetchGscSearchAnalytics(accessToken, siteUrl, fmt(previousStart), fmt(previousEnd), 'page'),
    ]);
    // Filter to rows that have keys (always present when dimension is 'page')
    currentData = rawCurrent.filter((r): r is typeof r & { keys: string[] } => !!r.keys);
    previousData = rawPrevious.filter((r): r is typeof r & { keys: string[] } => !!r.keys);
  } catch (err) {
    logger.warn({ jobId, brandId, err: (err as Error).message }, 'Failed to fetch GSC data for decay detection');
    return;
  }

  const currentPages = aggregateByPage(currentData);
  const previousPages = aggregateByPage(previousData);

  // Find decaying pages
  const decayingPages: DecayingPage[] = [];

  for (const [page, current] of currentPages) {
    const previous = previousPages.get(page);
    if (!previous || previous.clicks === 0) continue;

    const clicksDeltaPct = ((current.clicks - previous.clicks) / previous.clicks) * 100;
    const impressionsDeltaPct =
      previous.impressions > 0 ? ((current.impressions - previous.impressions) / previous.impressions) * 100 : 0;
    const positionDelta = current.position - previous.position;

    // Filter: clicks down >20% AND impressions down >15%
    if (clicksDeltaPct < -20 && impressionsDeltaPct < -15) {
      decayingPages.push({
        page,
        current_clicks: current.clicks,
        previous_clicks: previous.clicks,
        clicks_delta_pct: Math.round(clicksDeltaPct * 10) / 10,
        current_impressions: current.impressions,
        previous_impressions: previous.impressions,
        impressions_delta_pct: Math.round(impressionsDeltaPct * 10) / 10,
        current_position: Math.round(current.position * 10) / 10,
        previous_position: Math.round(previous.position * 10) / 10,
        position_delta: Math.round(positionDelta * 10) / 10,
        decay_score: calculateDecayScore(clicksDeltaPct, impressionsDeltaPct, positionDelta),
      });
    }
  }

  if (decayingPages.length === 0) {
    logger.info({ jobId, brandId }, 'No decaying pages detected');
    return;
  }

  // Sort by decay score descending, take top 10
  decayingPages.sort((a, b) => b.decay_score - a.decay_score);
  const top10 = decayingPages.slice(0, 10);

  // Use Claude to analyze and recommend
  const prompt = await loadActivePrompt('content_decay_analyzer_v1');
  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;

  const result = await callClaude(
    prompt,
    {
      brand_name: brand.name,
      brand_industry: guardrails.industry || 'unknown',
      decaying_pages: JSON.stringify(top10, null, 2),
    },
    decayAnalysisSchema,
    { trackUsage: { db, brandId, jobId } },
  );

  // Create recommendations
  let created = 0;
  for (const page of result.data.pages) {
    const decayInfo = top10.find((d) => d.page === page.page_url);
    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'content_decay_detector',
        priority: page.priority,
        title: `Content decay: ${page.page_url}`,
        body: `**Diagnosis:** ${page.diagnosis}\n\n**Recommended Actions:**\n${page.refresh_actions.map((a) => `- ${a}`).join('\n')}\n\n**Estimated Recovery:** ${page.estimated_recovery_weeks} weeks`,
        data: {
          page_url: page.page_url,
          decay_score: decayInfo?.decay_score,
          clicks_delta_pct: decayInfo?.clicks_delta_pct,
          impressions_delta_pct: decayInfo?.impressions_delta_pct,
          position_delta: decayInfo?.position_delta,
        },
        model_meta: result.model_meta,
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'content_decay_detector', priority: page.priority },
      `rec:${rec.id}`,
      'content_decay_detector',
    );
    created++;
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'content_decay_detector',
      totalDecaying: decayingPages.length,
      analyzed: top10.length,
      created,
      durationMs: Date.now() - startTime,
    },
    'Content_Decay_Detector completed',
  );
}
