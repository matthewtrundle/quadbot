import { gscDigestOutputSchema } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
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

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  try {
    return readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf-8');
  } catch {
    return '[]';
  }
}

type GscTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

/**
 * Load GSC credentials for a brand integration.
 * Supports both direct credentials and shared credentials.
 */
async function loadGscCredentials(
  db: JobContext['db'],
  brandId: string,
): Promise<GscTokens | null> {
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, 'google_search_console'),
      ),
    )
    .limit(1);

  if (!integration) {
    return null;
  }

  // Check for shared credentials first
  if (integration.shared_credential_id) {
    const [shared] = await db
      .select()
      .from(sharedCredentials)
      .where(eq(sharedCredentials.id, integration.shared_credential_id))
      .limit(1);

    if (shared) {
      return JSON.parse(decrypt(shared.credentials_encrypted)) as GscTokens;
    }
  }

  // Fall back to direct credentials
  if (integration.credentials_encrypted) {
    return JSON.parse(decrypt(integration.credentials_encrypted)) as GscTokens;
  }

  return null;
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

  // Load GSC credentials (supports both shared and direct)
  const credentials = await loadGscCredentials(db, brandId);
  if (credentials) {
    logger.info({ jobId, brandId }, 'GSC credentials loaded successfully');
    // In production, use credentials.access_token to fetch real GSC data
    // For now, we continue using fixture data
  } else {
    logger.info({ jobId, brandId }, 'No GSC credentials found, using fixture data');
  }

  const prompt = await loadActivePrompt('gsc_digest_recommender_v1');

  const gscToday = loadFixture('gsc_today.json');
  const gscYesterday = loadFixture('gsc_yesterday.json');

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
