import cron from 'node-cron';
import { db } from '@quadbot/db';
import { brands, jobs } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import { enqueue } from './queue.js';
import { JobType, QUEUE_KEY } from '@quadbot/shared';
import { logger } from './logger.js';
import { randomUUID } from 'node:crypto';

export function startCronScheduler(redis: Redis): void {
  // GSC Daily Digest - every day at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    logger.info('Cron: triggering GSC daily digest for all brands');
    await enqueueForAllBrands(redis, JobType.GSC_DAILY_DIGEST);
  });

  // Trend Scan - every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    logger.info('Cron: triggering trend scan for all brands');
    await enqueueForAllBrands(redis, JobType.TREND_SCAN_INDUSTRY);
  });

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

  logger.info('Cron scheduler started');
}

async function enqueueForAllBrands(redis: Redis, jobType: string): Promise<void> {
  try {
    const allBrands = await db.select({ id: brands.id }).from(brands);

    for (const brand of allBrands) {
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

      logger.info({ brandId: brand.id, jobType, jobId }, 'Enqueued cron job');
    }
  } catch (err) {
    logger.error({ err, jobType }, 'Failed to enqueue cron jobs');
  }
}
