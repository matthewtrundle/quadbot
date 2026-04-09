import cron from 'node-cron';
import { db } from '@quadbot/db';
import { brands, brandIntegrations, jobs, signals } from '@quadbot/db';
import { eq, and, gt, sql } from 'drizzle-orm';
import type Redis from 'ioredis';
import { enqueue } from './queue.js';
import { JobType } from '@quadbot/shared';
import { logger } from './logger.js';
import { randomUUID } from 'node:crypto';

export function startCronScheduler(redis: Redis): void {
  // GSC Daily Digest - every day at 8:00 AM (only brands with GSC integration)
  cron.schedule('0 8 * * *', async () => {
    logger.info('Cron: triggering GSC daily digest for eligible brands');
    await enqueueForBrandsWithIntegration(redis, JobType.GSC_DAILY_DIGEST, 'google_search_console');
  });

  // Trend Scan — PAUSED (541 recs, 0 action conversions; re-enable after core loop is tight)
  // cron.schedule('0 9 * * *', async () => {
  //   logger.info('Cron: triggering trend scan for all brands');
  //   await enqueueForAllBrands(redis, JobType.TREND_SCAN_INDUSTRY);
  // });

  // Phase 5: Outcome Collector - daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Cron: triggering outcome collector for all brands');
    await enqueueForAllBrands(redis, JobType.OUTCOME_COLLECTOR);
  });

  // Phase 5: Prompt Scorer - weekly on Sundays at 3:00 AM
  cron.schedule('0 3 * * 0', async () => {
    logger.info('Cron: triggering prompt scorer for all brands');
    await enqueueForAllBrands(redis, JobType.PROMPT_SCORER);
  });

  // Phase 5: Strategic Prioritizer - daily at 10:00 AM (after daily digest)
  cron.schedule('0 10 * * *', async () => {
    logger.info('Cron: triggering strategic prioritizer for all brands');
    await enqueueForAllBrands(redis, JobType.STRATEGIC_PRIORITIZER);
  });

  // Phase 3: Metric Snapshot - daily at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    logger.info('Cron: triggering metric snapshot for all brands');
    await enqueueForAllBrands(redis, JobType.METRIC_SNAPSHOT);
  });

  // Phase 3: Evaluation Scorer - daily at 4:00 AM
  cron.schedule('0 4 * * *', async () => {
    logger.info('Cron: triggering evaluation scorer for all brands');
    await enqueueForAllBrands(redis, JobType.EVALUATION_SCORER);
  });

  // Phase 6: Content Optimizer — PAUSED (low value; re-enable after core loop proves ROI)
  // cron.schedule('0 11 * * *', async () => {
  //   logger.info('Cron: triggering content optimizer for all brands');
  //   await enqueueForAllBrands(redis, JobType.CONTENT_OPTIMIZER);
  // });

  // Phase 7: Ads Performance Digest — PAUSED (100% dismissal rate for Lonestar)
  // cron.schedule('30 8 * * *', async () => {
  //   logger.info('Cron: triggering ads performance digest for eligible brands');
  //   await enqueueForBrandsWithIntegration(redis, JobType.ADS_PERFORMANCE_DIGEST, 'google_ads');
  // });

  // Analytics Insights — PAUSED (zero brands with GA4 connected)
  // cron.schedule('45 8 * * *', async () => {
  //   logger.info('Cron: triggering analytics insights for all brands');
  //   await enqueueForAllBrands(redis, JobType.ANALYTICS_INSIGHTS);
  // });

  // Cross-Channel Correlator — PAUSED (28% dismissal, needs core loop first)
  // cron.schedule('0 12 * * *', async () => {
  //   logger.info('Cron: triggering cross-channel correlator for eligible brands');
  //   await enqueueForBrandsWithMultipleIntegrations(redis, JobType.CROSS_CHANNEL_CORRELATOR, 2);
  // });

  // Source Quality Scorer — PAUSED (useful later when multiple sources are active)
  // cron.schedule('30 3 * * 0', async () => {
  //   logger.info('Cron: triggering source quality scorer for all brands');
  //   await enqueueForAllBrands(redis, JobType.SOURCE_QUALITY_SCORER);
  // });

  // Daily Email Digest — PAUSED (summary only, dashboard is primary UX)
  // cron.schedule('0 7 * * *', async () => {
  //   logger.info('Cron: triggering daily email digest for all brands');
  //   await enqueueForAllBrands(redis, JobType.DAILY_EMAIL_DIGEST);
  // });

  // Anomaly Detector — PAUSED (0 action conversions; re-enable after core loop)
  // cron.schedule('30 1 * * *', async () => {
  //   logger.info('Cron: triggering anomaly detector for all brands');
  //   await enqueueForAllBrands(redis, JobType.ANOMALY_DETECTOR);
  // });

  // Weekly Summary Email — PAUSED
  // cron.schedule('0 10 * * 0', async () => {
  //   logger.info('Cron: triggering weekly summary email for all brands');
  //   await enqueueForAllBrands(redis, JobType.WEEKLY_SUMMARY_EMAIL);
  // });

  // Cross-Brand Benchmark Generator — PAUSED (needs core loop first)
  // cron.schedule('0 5 * * 1', async () => {
  //   logger.info('Cron: triggering benchmark generator for all brands');
  //   await enqueueForAllBrands(redis, JobType.BENCHMARK_GENERATOR);
  // });

  // Content Automation — PAUSED (depends on trend scan which is paused)
  // cron.schedule('30 9 * * *', async () => {
  //   logger.info('Cron: triggering content automation for all brands');
  //   await enqueueForAllBrands(redis, JobType.CONTENT_AUTOMATION);
  // });

  // Phase 8: Capability Gap Analyzer — PAUSED (self-improvement; premature)
  // cron.schedule('0 6 * * 1', async () => {
  //   logger.info('Cron: triggering capability gap analyzer for all brands');
  //   await enqueueForAllBrands(redis, JobType.CAPABILITY_GAP_ANALYZER);
  // });

  // Outreach: Campaign Scheduler — PAUSED (zero activity, 23K wasted runs/14d)
  // cron.schedule('*/15 * * * *', async () => {
  //   logger.info('Cron: triggering outreach campaign scheduler for all brands');
  //   await enqueueForAllBrands(redis, JobType.OUTREACH_CAMPAIGN_SCHEDULER);
  // });

  // Outreach: Campaign Analytics — PAUSED (no active outreach)
  // cron.schedule('0 6 * * *', async () => {
  //   logger.info('Cron: triggering outreach campaign analytics for all brands');
  //   await enqueueForAllBrands(redis, JobType.OUTREACH_CAMPAIGN_ANALYTICS);
  // });

  // Phase 2: Embedding Indexer — PAUSED (RAG not proving value yet)
  // cron.schedule('0 3 * * *', async () => {
  //   logger.info('Cron: triggering embedding indexer for all brands');
  //   await enqueueForAllBrands(redis, JobType.EMBEDDING_INDEXER);
  // });

  // Phase 2: Content Decay Detector — PAUSED (6 recs total, negligible)
  // cron.schedule('0 7 * * 1', async () => {
  //   logger.info('Cron: triggering content decay detector for all brands');
  //   await enqueueForAllBrands(redis, JobType.CONTENT_DECAY_DETECTOR);
  // });

  // Phase 2: Internal Linking Suggestions — PAUSED
  // cron.schedule('0 6 * * 3', async () => {
  //   logger.info('Cron: triggering internal linking for all brands');
  //   await enqueueForAllBrands(redis, JobType.INTERNAL_LINKING);
  // });

  // Wave 3: HubSpot Sync — PAUSED (not actively used)
  // cron.schedule('0 */4 * * *', async () => {
  //   logger.info('Cron: triggering HubSpot sync for all brands');
  //   await enqueueForAllBrands(redis, JobType.HUBSPOT_SYNC);
  // });

  // PageSpeed check — PAUSED
  // cron.schedule('0 6 * * 1', async () => {
  //   logger.info('Cron: triggering pagespeed monitor for all brands');
  //   await enqueueForAllBrands(redis, JobType.PAGESPEED_MONITOR);
  // });

  // Wave 3: Competitor Monitor — PAUSED
  // cron.schedule('0 2 * * 0', async () => {
  //   logger.info('Cron: triggering competitor monitor for all brands');
  //   await enqueueForAllBrands(redis, JobType.COMPETITOR_MONITOR);
  // });

  // Wave 3: Schema.org Analyzer — PAUSED
  // cron.schedule('0 4 1 * *', async () => {
  //   logger.info('Cron: triggering schema.org analyzer for all brands');
  //   await enqueueForAllBrands(redis, JobType.SCHEMA_ORG_ANALYZER);
  // });

  // Signal Decay - daily at 5:00 AM
  // Exponential decay: decay_weight = e^(-age_days / HALF_LIFE_DAYS * ln(2))
  // Half-life of 30 days means a 30-day-old signal has 50% weight.
  cron.schedule('0 5 * * *', async () => {
    await decaySignalWeights();
  });

  logger.info('Cron scheduler started');
}

/**
 * Enqueue a job only for active brands that have N+ integrations connected.
 * Used for cross-channel correlator which needs multiple data sources.
 */
async function enqueueForBrandsWithMultipleIntegrations(
  redis: Redis,
  jobType: string,
  minIntegrations: number,
): Promise<void> {
  try {
    const rows = await db
      .select({ brandId: brandIntegrations.brand_id })
      .from(brandIntegrations)
      .innerJoin(brands, eq(brands.id, brandIntegrations.brand_id))
      .where(eq(brands.is_active, true))
      .groupBy(brandIntegrations.brand_id);

    // Filter to brands with enough integrations
    const countByBrand = new Map<string, number>();
    for (const row of rows) {
      countByBrand.set(row.brandId, (countByBrand.get(row.brandId) || 0) + 1);
    }

    const eligibleBrandIds = [...countByBrand.entries()]
      .filter(([, count]) => count >= minIntegrations)
      .map(([id]) => id);

    if (eligibleBrandIds.length === 0) {
      logger.info({ jobType, minIntegrations }, 'No brands with enough integrations — skipping');
      return;
    }

    let succeeded = 0;
    let failed = 0;

    for (const brandId of eligibleBrandIds) {
      try {
        const jobId = randomUUID();
        await db.insert(jobs).values({ id: jobId, brand_id: brandId, type: jobType, status: 'queued', payload: {} });
        await enqueue(redis, { jobId, type: jobType, payload: { brand_id: brandId } });
        succeeded++;
      } catch (err) {
        failed++;
        logger.error({ err, brandId, jobType }, 'Failed to enqueue cron job for brand');
      }
    }

    logger.info(
      { jobType, eligible: eligibleBrandIds.length, succeeded, failed },
      'Multi-integration enqueue complete',
    );
  } catch (err) {
    logger.error({ err, jobType }, 'Failed to fetch brands for multi-integration enqueue');
  }
}

/**
 * Enqueue a job only for active brands that have a specific integration type connected.
 * Prevents running GSC jobs for brands without GSC, Ads jobs for brands without Ads, etc.
 */
async function enqueueForBrandsWithIntegration(redis: Redis, jobType: string, integrationType: string): Promise<void> {
  let eligibleBrandIds: string[];
  try {
    const rows = await db
      .select({ brandId: brandIntegrations.brand_id })
      .from(brandIntegrations)
      .innerJoin(brands, eq(brands.id, brandIntegrations.brand_id))
      .where(and(eq(brands.is_active, true), eq(brandIntegrations.type, integrationType)));

    eligibleBrandIds = rows.map((r) => r.brandId);
  } catch (err) {
    logger.error({ err, jobType, integrationType }, 'Failed to fetch eligible brands');
    return;
  }

  if (eligibleBrandIds.length === 0) {
    logger.info({ jobType, integrationType }, 'No brands with integration — skipping');
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const brandId of eligibleBrandIds) {
    try {
      const jobId = randomUUID();
      await db.insert(jobs).values({ id: jobId, brand_id: brandId, type: jobType, status: 'queued', payload: {} });
      await enqueue(redis, { jobId, type: jobType, payload: { brand_id: brandId } });
      succeeded++;
      logger.info({ brandId, jobType, jobId }, 'Enqueued cron job (integration-gated)');
    } catch (err) {
      failed++;
      logger.error({ err, brandId, jobType }, 'Failed to enqueue cron job for brand');
    }
  }

  if (failed > 0) {
    logger.warn({ jobType, succeeded, failed, total: eligibleBrandIds.length }, 'Cron enqueue completed with failures');
  }

  logger.info({ jobType, integrationType, eligible: eligibleBrandIds.length }, 'Integration-gated enqueue complete');
}

async function enqueueForAllBrands(redis: Redis, jobType: string): Promise<void> {
  let allBrands;
  try {
    allBrands = await db.select({ id: brands.id }).from(brands).where(eq(brands.is_active, true));
  } catch (err) {
    logger.error({ err, jobType }, 'Failed to fetch brands for cron enqueue');
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const brand of allBrands) {
    try {
      const jobId = randomUUID();

      await db.insert(jobs).values({
        id: jobId,
        brand_id: brand.id,
        type: jobType,
        status: 'queued',
        payload: {},
      });

      await enqueue(redis, {
        jobId,
        type: jobType,
        payload: { brand_id: brand.id },
      });

      succeeded++;
      logger.info({ brandId: brand.id, jobType, jobId }, 'Enqueued cron job');
    } catch (err) {
      failed++;
      logger.error({ err, brandId: brand.id, jobType }, 'Failed to enqueue cron job for brand');
    }
  }

  if (failed > 0) {
    logger.warn({ jobType, succeeded, failed, total: allBrands.length }, 'Cron enqueue completed with failures');
  }
}

const SIGNAL_HALF_LIFE_DAYS = 30;

/**
 * Decay signal weights using exponential decay based on age.
 * Formula: decay_weight = e^(-age_days * ln(2) / half_life)
 *
 * At half_life=30 days:
 *   0 days  → 1.00
 *   15 days → 0.71
 *   30 days → 0.50
 *   60 days → 0.25
 *   90 days → 0.13
 *
 * Single SQL update — no per-row queries needed.
 */
async function decaySignalWeights(): Promise<void> {
  try {
    const now = new Date();

    const result = await db
      .update(signals)
      .set({
        decay_weight: sql`exp(-1.0 * extract(epoch from (${now.toISOString()}::timestamptz - ${signals.created_at})) / 86400.0 * ln(2) / ${SIGNAL_HALF_LIFE_DAYS})`,
      })
      .where(gt(signals.expires_at, now));

    logger.info('Signal decay weights updated');
  } catch (err) {
    logger.error({ err }, 'Failed to decay signal weights');
  }
}
