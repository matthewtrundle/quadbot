import { recommendations, brands, metricSnapshots } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import Anthropic from '@anthropic-ai/sdk';
import { loadGscCredentials, refreshAccessToken, fetchGscSearchAnalytics } from '../lib/gsc-api.js';
import { persistRefreshedTokens } from '../lib/token-persistence.js';
import { brandIntegrations } from '@quadbot/db';
import { and } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

type RedirectSuggestion = {
  source_url: string;
  target_url: string;
  confidence: number;
  reason: string;
  lost_traffic_estimate: number;
};

type PageCandidate = {
  url: string;
  impressions: number;
  clicks: number;
  position: number;
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
 * Auto Redirect Manager
 *
 * Detects potential 404 errors and pages losing traffic from GSC data,
 * then uses Claude to suggest optimal redirect targets.
 *
 * Steps:
 * 1. Load brand, check 'auto_redirect' module enabled
 * 2. Load GSC credentials
 * 3. Fetch page-level GSC data for recent and prior periods
 * 4. Identify pages with sharp traffic drops (potential 404s or removed pages)
 * 5. Use Claude to find best redirect targets for each candidate
 * 6. Create recommendations with redirect suggestions
 * 7. Store redirect_suggestions_count metric
 * 8. Emit REDIRECT_SUGGESTED event
 */
export async function autoRedirectManager(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'auto_redirect_manager' }, 'Auto_Redirect_Manager starting');

  // 1. Load brand and check module
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('auto_redirect')) {
    logger.info({ jobId, brandId }, 'auto_redirect module not enabled, skipping');
    return;
  }

  // 2. Load GSC credentials
  const credentials = await loadGscCredentials(db, brandId);
  const siteUrl = await getGscSiteUrl(db, brandId);

  if (!credentials || !siteUrl) {
    logger.info(
      { jobId, brandId, hasCredentials: !!credentials, hasSiteUrl: !!siteUrl },
      'No GSC credentials or site URL — skipping auto redirect manager',
    );
    return;
  }

  // 3. Fetch page-level GSC data for two periods to detect traffic drops
  let recentPages: PageCandidate[];
  let priorPages: PageCandidate[];

  try {
    const accessToken = await getValidGscToken(db, brandId, credentials);

    const today = new Date();
    // Recent period: last 7 days (with 3-day GSC lag)
    const recentEnd = new Date(today);
    recentEnd.setDate(recentEnd.getDate() - 3);
    const recentStart = new Date(recentEnd);
    recentStart.setDate(recentStart.getDate() - 6);

    // Prior period: 7 days before that
    const priorEnd = new Date(recentStart);
    priorEnd.setDate(priorEnd.getDate() - 1);
    const priorStart = new Date(priorEnd);
    priorStart.setDate(priorStart.getDate() - 6);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const [recentData, priorData] = await Promise.all([
      fetchGscSearchAnalytics(accessToken, siteUrl, fmt(recentStart), fmt(recentEnd), 'page'),
      fetchGscSearchAnalytics(accessToken, siteUrl, fmt(priorStart), fmt(priorEnd), 'page'),
    ]);

    recentPages = recentData.map((r) => ({
      url: r.query, // When dimension is 'page', query field contains the URL
      impressions: r.impressions,
      clicks: r.clicks,
      position: r.position,
    }));

    priorPages = priorData.map((r) => ({
      url: r.query,
      impressions: r.impressions,
      clicks: r.clicks,
      position: r.position,
    }));

    logger.info(
      {
        jobId,
        brandId,
        recentPeriod: `${fmt(recentStart)}..${fmt(recentEnd)}`,
        priorPeriod: `${fmt(priorStart)}..${fmt(priorEnd)}`,
        recentPageCount: recentPages.length,
        priorPageCount: priorPages.length,
      },
      'Fetched GSC page data for redirect analysis',
    );
  } catch (err) {
    logger.warn(
      { jobId, brandId, err: (err as Error).message },
      'Failed to fetch GSC page data — skipping auto redirect manager',
    );
    return;
  }

  // 4. Identify pages with sharp traffic drops
  // Pages that appeared in prior period but not in recent, or with >80% traffic drop
  const recentUrlMap = new Map(recentPages.map((p) => [p.url, p]));
  const priorUrlMap = new Map(priorPages.map((p) => [p.url, p]));

  const candidates: Array<{ url: string; priorClicks: number; recentClicks: number; dropPct: number }> = [];

  for (const [url, priorPage] of priorUrlMap) {
    // Only consider pages with meaningful prior traffic
    if (priorPage.clicks < 3) continue;

    const recentPage = recentUrlMap.get(url);
    const recentClicks = recentPage?.clicks ?? 0;
    const dropPct = priorPage.clicks > 0 ? ((priorPage.clicks - recentClicks) / priorPage.clicks) * 100 : 0;

    // Flag pages with >80% traffic drop or completely gone
    if (dropPct >= 80) {
      candidates.push({
        url,
        priorClicks: priorPage.clicks,
        recentClicks,
        dropPct: Math.round(dropPct),
      });
    }
  }

  if (candidates.length === 0) {
    logger.info({ jobId, brandId }, 'No pages with significant traffic drops found');

    // Still store metric for tracking
    await db.insert(metricSnapshots).values({
      brand_id: brandId,
      source: 'auto_redirect',
      metric_key: 'redirect_suggestions_count',
      value: 0,
    });

    return;
  }

  // Sort by prior traffic (highest lost traffic first) and take top 20
  candidates.sort((a, b) => b.priorClicks - a.priorClicks);
  const topCandidates = candidates.slice(0, 20);

  // Get top active pages as potential redirect targets
  const topPages = recentPages
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 50)
    .map((p) => ({ url: p.url, clicks: p.clicks, impressions: p.impressions }));

  logger.info(
    { jobId, brandId, candidateCount: topCandidates.length, topPagesCount: topPages.length },
    'Identified redirect candidates',
  );

  // 5. Use Claude to find best redirect targets
  const anthropic = new Anthropic();
  let suggestions: RedirectSuggestion[] = [];

  try {
    const prompt = `You are an SEO redirect specialist. Analyze these URLs that have experienced significant traffic drops (likely 404s or removed pages) and suggest the best redirect target for each.

**Brand:** ${brand.name}
**Site:** ${siteUrl}

**Pages with traffic drops (potential 404s):**
${topCandidates.map((c) => `- ${c.url} (was ${c.priorClicks} clicks/week, now ${c.recentClicks}, -${c.dropPct}%)`).join('\n')}

**Active pages on the site (potential redirect targets):**
${topPages.map((p) => `- ${p.url} (${p.clicks} clicks, ${p.impressions} impressions)`).join('\n')}

For each dropped page, find the most semantically relevant active page to redirect to. Consider URL structure, topic relevance, and user intent.

Return JSON only (no markdown fences):
[
  {
    "source_url": "the dropped URL",
    "target_url": "the best redirect target",
    "confidence": 0.0-1.0,
    "reason": "why this redirect makes sense",
    "lost_traffic_estimate": estimated weekly clicks lost
  }
]

Only include suggestions where you have reasonable confidence (>0.5) in the redirect target. If no good match exists for a URL, skip it.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      throw new Error('Claude response is not a JSON array');
    }

    suggestions = parsed.map((item: Record<string, unknown>) => ({
      source_url: String(item.source_url || ''),
      target_url: String(item.target_url || ''),
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
      reason: String(item.reason || ''),
      lost_traffic_estimate: Number(item.lost_traffic_estimate) || 0,
    }));

    // Filter out low-confidence suggestions
    suggestions = suggestions.filter((s) => s.confidence >= 0.5 && s.source_url && s.target_url);

    logger.info({ jobId, brandId, suggestionsCount: suggestions.length }, 'Claude redirect analysis complete');
  } catch (err) {
    logger.error({ jobId, brandId, err: (err as Error).message }, 'Failed to get or parse Claude response');
    throw err;
  }

  // 6. Create recommendations for each redirect suggestion
  for (const suggestion of suggestions) {
    const priority =
      suggestion.lost_traffic_estimate > 50 ? 'high' : suggestion.lost_traffic_estimate > 10 ? 'medium' : 'low';

    const body = `**Redirect Suggestion**

**Source URL (lost traffic):** ${suggestion.source_url}
**Target URL (redirect to):** ${suggestion.target_url}
**Confidence:** ${Math.round(suggestion.confidence * 100)}%
**Estimated Lost Traffic:** ~${suggestion.lost_traffic_estimate} clicks/week

**Reason:** ${suggestion.reason}

**Implementation:**
Add a 301 redirect from the source URL to the target URL in your server configuration or .htaccess file.`;

    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'auto_redirect_manager',
        priority,
        confidence: suggestion.confidence,
        title: `Redirect: ${suggestion.source_url.replace(/^https?:\/\/[^/]+/, '')} → ${suggestion.target_url.replace(/^https?:\/\/[^/]+/, '')}`,
        body,
        data: {
          source_url: suggestion.source_url,
          target_url: suggestion.target_url,
          lost_traffic_estimate: suggestion.lost_traffic_estimate,
          redirect_type: '301',
        },
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'auto_redirect_manager', priority },
      `redirect:rec:${rec.id}`,
      'auto_redirect_manager',
    );
  }

  // 7. Store redirect_suggestions_count metric
  await db.insert(metricSnapshots).values({
    brand_id: brandId,
    source: 'auto_redirect',
    metric_key: 'redirect_suggestions_count',
    value: suggestions.length,
  });

  // 8. Emit REDIRECT_SUGGESTED event
  const totalLostTraffic = suggestions.reduce((sum, s) => sum + s.lost_traffic_estimate, 0);

  await emitEvent(
    EventType.REDIRECT_SUGGESTED,
    brandId,
    {
      suggestions_count: suggestions.length,
      candidates_analyzed: topCandidates.length,
      total_lost_traffic_estimate: totalLostTraffic,
      top_source_url: suggestions[0]?.source_url,
      top_target_url: suggestions[0]?.target_url,
    },
    `redirect:${brandId}:${new Date().toISOString().split('T')[0]}`,
    'auto_redirect_manager',
  );

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'auto_redirect_manager',
      candidatesAnalyzed: topCandidates.length,
      suggestionsCreated: suggestions.length,
      totalLostTraffic,
      durationMs: Date.now() - startTime,
    },
    'Auto_Redirect_Manager completed',
  );
}
