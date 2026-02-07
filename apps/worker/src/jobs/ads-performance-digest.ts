import { adsPerformanceOutputSchema } from '@quadbot/shared';
import { recommendations, brands, brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType, IntegrationType } from '@quadbot/shared';

type AdsCredentials = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

/**
 * Ads Performance Digest Job
 *
 * Analyzes Google Ads campaign data and generates:
 * - Campaign performance summaries
 * - Budget allocation recommendations
 * - Optimization opportunities
 *
 * Triggered: Daily at 8:30 AM (after GSC digest)
 */
export async function adsPerformanceDigest(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Check for Google Ads integration
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, IntegrationType.GOOGLE_ADS),
      ),
    )
    .limit(1);

  if (!integration) {
    logger.info({ jobId, brandId }, 'No Google Ads integration, skipping');
    return;
  }

  // Load prompt
  let prompt;
  try {
    prompt = await loadActivePrompt('ads_performance_digest_v1');
  } catch {
    logger.warn({ jobId }, 'Ads performance digest prompt not found, skipping');
    return;
  }

  // Load credentials (shared or direct)
  let credentials: AdsCredentials | null = null;
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

  // Get ads data (simulated for now)
  const adsData = getSimulatedAdsData();
  const adsPreviousData = getSimulatedAdsPreviousData();

  const result = await callClaude(
    prompt,
    {
      brand_name: brand[0].name,
      ads_data: JSON.stringify(adsData),
      ads_previous_data: JSON.stringify(adsPreviousData),
      account_goals: JSON.stringify({ target_roas: 4.0, monthly_budget: 10000 }),
    },
    adsPerformanceOutputSchema,
  );

  // Create summary recommendation
  const [summaryRec] = await db.insert(recommendations).values({
    brand_id: brandId,
    job_id: jobId,
    source: 'ads_performance_digest',
    priority: 'medium',
    title: 'Google Ads Weekly Performance',
    body: result.data.summary,
    data: {
      top_campaigns: result.data.top_campaigns,
      recommendations_count: result.data.recommendations.length,
    },
    model_meta: result.model_meta,
  }).returning();

  await emitEvent(
    EventType.RECOMMENDATION_CREATED,
    brandId,
    { recommendation_id: summaryRec.id, source: 'ads_performance_digest', priority: 'medium' },
    `ads:summary:${new Date().toISOString().slice(0, 10)}`,
    'ads_performance_digest',
  );

  // Create individual recommendations
  for (const rec of result.data.recommendations) {
    const [inserted] = await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'ads_performance_digest',
      priority: rec.priority,
      title: rec.title,
      body: rec.description,
      data: { type: rec.type },
      model_meta: result.model_meta,
    }).returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: inserted.id, source: 'ads_performance_digest', priority: rec.priority },
      `ads:rec:${inserted.id}`,
      'ads_performance_digest',
    );
  }

  logger.info(
    { jobId, brandId, recommendationsCount: result.data.recommendations.length },
    'Ads performance digest complete',
  );
}

function getSimulatedAdsData() {
  return {
    period: 'last_7_days',
    total_spend: 5250.50,
    total_impressions: 245000,
    total_clicks: 8700,
    total_conversions: 225,
    avg_cpc: 0.60,
    avg_roas: 3.8,
    campaigns: [
      { name: 'Brand Campaign', spend: 1250, clicks: 1800, conversions: 45, roas: 4.2 },
      { name: 'Performance Max', spend: 3200, clicks: 4500, conversions: 120, roas: 3.5 },
      { name: 'Remarketing', spend: 800, clicks: 2400, conversions: 60, roas: 4.8 },
    ],
  };
}

function getSimulatedAdsPreviousData() {
  return {
    period: 'prior_7_days',
    total_spend: 4800.00,
    total_impressions: 220000,
    total_clicks: 7800,
    total_conversions: 195,
    avg_cpc: 0.62,
    avg_roas: 3.6,
    campaigns: [
      { name: 'Brand Campaign', spend: 1200, clicks: 1700, conversions: 42, roas: 4.0 },
      { name: 'Performance Max', spend: 2900, clicks: 4000, conversions: 100, roas: 3.3 },
      { name: 'Remarketing', spend: 700, clicks: 2100, conversions: 53, roas: 4.5 },
    ],
  };
}
