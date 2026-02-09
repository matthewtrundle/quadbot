import { gscDigestOutputSchema, type BrandGuardrails, type GscDigestOutput } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude, type GroundingValidator } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import {
  loadGscCredentials,
  refreshAccessToken,
  fetchGscSearchAnalytics,
  type GscTokens,
} from '../lib/gsc-api.js';
import { persistRefreshedTokens } from '../lib/token-persistence.js';

/**
 * Get a valid GSC access token, refreshing and persisting if expired.
 */
async function getValidGscToken(
  db: JobContext['db'],
  brandId: string,
  credentials: GscTokens,
): Promise<string> {
  const expiresAt = new Date(credentials.expires_at);
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > Date.now()) {
    return credentials.access_token;
  }

  logger.info({ brandId }, 'Refreshing expired GSC access token');
  const freshTokens = await refreshAccessToken(credentials.refresh_token);

  // Persist refreshed tokens back to database
  await persistRefreshedTokens(db, brandId, 'google_search_console', freshTokens);

  return freshTokens.access_token;
}

/**
 * Get the GSC site URL from brand integration config.
 */
async function getGscSiteUrl(
  db: JobContext['db'],
  brandId: string,
): Promise<string | null> {
  const [integration] = await db
    .select({ config: brandIntegrations.config })
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, 'google_search_console'),
      ),
    )
    .limit(1);

  const config = integration?.config as Record<string, unknown> | undefined;
  // Support both camelCase (siteUrl) and snake_case (site_url) config keys
  return (config?.siteUrl as string) || (config?.site_url as string) || null;
}

/**
 * Extract query strings from GSC data JSON for grounding validation.
 */
function extractQueriesFromGscData(jsonStr: string): Set<string> {
  const queries = new Set<string>();
  try {
    const rows = JSON.parse(jsonStr);
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row.keys?.[0]) {
          queries.add(row.keys[0].toLowerCase());
        }
        if (row.query) {
          queries.add(String(row.query).toLowerCase());
        }
      }
    }
  } catch {
    // If data isn't parseable, return empty set
  }
  return queries;
}

/**
 * Grounding validator for GSC digest output.
 * Checks that top_changes reference actual queries from the input data.
 */
const gscGroundingValidator: GroundingValidator<GscDigestOutput> = (output, inputs) => {
  const todayQueries = extractQueriesFromGscData(String(inputs.gsc_today || '[]'));
  const yesterdayQueries = extractQueriesFromGscData(String(inputs.gsc_yesterday || '[]'));
  const allQueries = new Set([...todayQueries, ...yesterdayQueries]);

  if (allQueries.size === 0) {
    // No queries in input data — can't validate, let it pass
    return { valid: true };
  }

  // Verify top_changes reference actual input queries
  const ungrounded: string[] = [];
  for (const change of output.top_changes) {
    if (!allQueries.has(change.query.toLowerCase())) {
      ungrounded.push(change.query);
    }
  }

  if (ungrounded.length > 0) {
    return {
      valid: false,
      reason: `top_changes contain queries not found in input data: ${ungrounded.slice(0, 3).join(', ')}`,
    };
  }

  return { valid: true };
};

export async function gscDailyDigest(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Check if GSC digest module is enabled for this brand
  const modulesEnabled = (brand[0].modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('gsc_digest')) {
    logger.info({ jobId, brandId }, 'GSC digest module not enabled, skipping');
    return;
  }

  const credentials = await loadGscCredentials(db, brandId);
  const siteUrl = await getGscSiteUrl(db, brandId);

  if (!credentials || !siteUrl) {
    logger.info(
      { jobId, brandId, hasCredentials: !!credentials, hasSiteUrl: !!siteUrl },
      'No GSC credentials or site URL — skipping digest (no fixture fallback)',
    );
    return;
  }

  let gscToday: string;
  let gscYesterday: string;

  try {
    const accessToken = await getValidGscToken(db, brandId, credentials);

    const today = new Date();
    // GSC data typically has 2-day lag
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);

    const todayStr = endDate.toISOString().split('T')[0];
    const yesterdayStr = startDate.toISOString().split('T')[0];

    const [todayData, yesterdayData] = await Promise.all([
      fetchGscSearchAnalytics(accessToken, siteUrl, todayStr, todayStr),
      fetchGscSearchAnalytics(accessToken, siteUrl, yesterdayStr, yesterdayStr),
    ]);

    gscToday = JSON.stringify(todayData);
    gscYesterday = JSON.stringify(yesterdayData);
    logger.info({ jobId, brandId, siteUrl, todayRows: todayData.length, yesterdayRows: yesterdayData.length }, 'Fetched real GSC data');
  } catch (err) {
    logger.warn(
      { jobId, brandId, err: (err as Error).message },
      'Failed to fetch GSC data — skipping digest (no fixture fallback)',
    );
    return;
  }

  const prompt = await loadActivePrompt('gsc_digest_recommender_v1');

  // Read brand guardrails for context
  const guardrails = (brand[0].guardrails || {}) as Partial<BrandGuardrails>;

  const variables = {
    brand_name: brand[0].name,
    brand_domain: siteUrl,
    brand_industry: guardrails.industry || 'unknown',
    brand_description: guardrails.description || '',
    gsc_today: gscToday,
    gsc_yesterday: gscYesterday,
  };

  const result = await callClaude(
    prompt,
    variables,
    gscDigestOutputSchema,
    { groundingValidator: gscGroundingValidator },
  );

  // Insert summary recommendation
  const [summaryRec] = await db.insert(recommendations).values({
    brand_id: brandId,
    job_id: jobId,
    source: 'gsc_daily_digest',
    priority: 'medium',
    title: 'GSC Daily Digest',
    body: result.data.summary,
    data: {
      top_changes: result.data.top_changes,
      recommendations_count: result.data.recommendations.length,
    },
    model_meta: result.model_meta,
  }).returning();

  await emitEvent(
    EventType.RECOMMENDATION_CREATED,
    brandId,
    { recommendation_id: summaryRec.id, source: 'gsc_daily_digest', priority: 'medium' },
    `rec:${summaryRec.id}`,
    'gsc_daily_digest',
  );

  // Insert individual recommendations
  for (const rec of result.data.recommendations) {
    const [inserted] = await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'gsc_daily_digest',
      priority: rec.priority,
      title: rec.title,
      body: rec.description,
      data: { type: rec.type },
      model_meta: result.model_meta,
      }).returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: inserted.id, source: 'gsc_daily_digest', priority: rec.priority },
      `rec:${inserted.id}`,
      'gsc_daily_digest',
    );
  }

  logger.info(
    { jobId, recommendationsCount: result.data.recommendations.length },
    'GSC daily digest complete',
  );
}
