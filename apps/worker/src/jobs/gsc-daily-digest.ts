import { gscDigestOutputSchema } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
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

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  try {
    return readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf-8');
  } catch {
    return '[]';
  }
}

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

  return (integration?.config as { site_url?: string })?.site_url || null;
}

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

  const prompt = await loadActivePrompt('gsc_digest_recommender_v1');

  // Attempt to fetch real GSC data; fall back to fixtures if no credentials
  let gscToday: string;
  let gscYesterday: string;

  const credentials = await loadGscCredentials(db, brandId);
  const siteUrl = await getGscSiteUrl(db, brandId);

  if (credentials && siteUrl) {
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
      logger.warn({ jobId, brandId, err: (err as Error).message }, 'Failed to fetch real GSC data, falling back to fixtures');
      gscToday = loadFixture('gsc_today.json');
      gscYesterday = loadFixture('gsc_yesterday.json');
    }
  } else {
    logger.info({ jobId, brandId, hasCredentials: !!credentials, hasSiteUrl: !!siteUrl }, 'No GSC credentials or site URL, using fixture data');
    gscToday = loadFixture('gsc_today.json');
    gscYesterday = loadFixture('gsc_yesterday.json');
  }

  const result = await callClaude(
    prompt,
    {
      brand_name: brand[0].name,
      gsc_today: gscToday,
      gsc_yesterday: gscYesterday,
    },
    gscDigestOutputSchema,
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
