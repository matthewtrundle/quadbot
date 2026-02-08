import { db } from '@quadbot/db';
import { jobs } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { queuePayloadSchema, MAX_ATTEMPTS, JobType } from '@quadbot/shared';
import { config } from './config.js';
import { logger } from './logger.js';
import { getRedis, startConsumer, moveToDeadLetter, enqueue, closeRedis } from './queue.js';
import { registerHandler, getHandler } from './registry.js';
import { startExecutionLoop } from './execution-loop.js';
import { startCronScheduler } from './cron.js';
import { startEventProcessor } from './event-processor.js';
import { startJobReaper } from './job-reaper.js';
import { seedPrompts } from './seed-prompts.js';
import { registerAllExecutors } from './executors/index.js';
import { communityModeratePost } from './jobs/community-moderate.js';
import { gscDailyDigest } from './jobs/gsc-daily-digest.js';
import { trendScanIndustry } from './jobs/trend-scan.js';
import { actionDraftGenerator } from './jobs/action-draft-generator.js';
// Phase 5: Learning Loop
import { outcomeCollector } from './jobs/outcome-collector.js';
import { promptScorer } from './jobs/prompt-scorer.js';
// Phase 3: Evaluation
import { metricSnapshotCollector } from './jobs/metric-snapshot-collector.js';
import { evaluationScorer } from './jobs/evaluation-scorer.js';
// Phase 4: Brand Brain
import { signalExtractor } from './jobs/signal-extractor.js';
// Phase 5: Decision Engine
import { strategicPrioritizer } from './jobs/strategic-prioritizer.js';
// Phase 6: Content Generation
import { contentOptimizer } from './jobs/content-optimizer.js';
// Phase 7: Multi-Source Intelligence
import { adsPerformanceDigest } from './jobs/ads-performance-digest.js';
import { analyticsInsights } from './jobs/analytics-insights.js';
import { crossChannelCorrelator } from './jobs/cross-channel-correlator.js';
// Phase 8: Self-Improvement Engine
import { capabilityGapAnalyzer } from './jobs/capability-gap-analyzer.js';

// Register job handlers
registerHandler(JobType.COMMUNITY_MODERATE_POST, communityModeratePost);
registerHandler(JobType.GSC_DAILY_DIGEST, gscDailyDigest);
registerHandler(JobType.TREND_SCAN_INDUSTRY, trendScanIndustry);
registerHandler(JobType.ACTION_DRAFT_GENERATOR, actionDraftGenerator);
// Phase 5: Learning Loop handlers
registerHandler(JobType.OUTCOME_COLLECTOR, outcomeCollector);
registerHandler(JobType.PROMPT_SCORER, promptScorer);
// Phase 3: Evaluation handlers
registerHandler(JobType.METRIC_SNAPSHOT, metricSnapshotCollector);
registerHandler(JobType.EVALUATION_SCORER, evaluationScorer);
// Phase 4: Brand Brain handlers
registerHandler(JobType.SIGNAL_EXTRACTOR, signalExtractor);
// Phase 5: Decision Engine handlers
registerHandler(JobType.STRATEGIC_PRIORITIZER, strategicPrioritizer);
// Phase 6: Content Generation handlers
registerHandler(JobType.CONTENT_OPTIMIZER, contentOptimizer);
// Phase 7: Multi-Source Intelligence handlers
registerHandler(JobType.ADS_PERFORMANCE_DIGEST, adsPerformanceDigest);
registerHandler(JobType.ANALYTICS_INSIGHTS, analyticsInsights);
registerHandler(JobType.CROSS_CHANNEL_CORRELATOR, crossChannelCorrelator);
// Phase 8: Self-Improvement Engine handlers
registerHandler(JobType.CAPABILITY_GAP_ANALYZER, capabilityGapAnalyzer);

async function handleMessage(message: string): Promise<void> {
  let parsed;
  try {
    parsed = queuePayloadSchema.parse(JSON.parse(message));
  } catch (err) {
    logger.error({ err, message: message.slice(0, 500) }, 'Failed to parse queue message');

    // Attempt to extract jobId from malformed message to mark it failed
    try {
      const raw = JSON.parse(message);
      if (raw?.jobId) {
        await db
          .update(jobs)
          .set({ status: 'failed', error: 'Queue message failed schema validation', updated_at: new Date() })
          .where(eq(jobs.id, raw.jobId));
        logger.info({ jobId: raw.jobId }, 'Marked malformed job as failed');
      }
    } catch {
      // Can't even extract jobId — move to DLQ
      const redis = getRedis(config.REDIS_URL);
      await moveToDeadLetter(redis, message);
    }
    return;
  }

  const { jobId, type, payload } = parsed;
  const handler = getHandler(type);

  if (!handler) {
    logger.error({ type, jobId }, 'No handler registered for job type');
    // Mark the job as failed instead of silently dropping it
    await db
      .update(jobs)
      .set({ status: 'failed', error: `No handler registered for job type: ${type}`, updated_at: new Date() })
      .where(eq(jobs.id, jobId));
    return;
  }

  try {
    // Get current job state and increment attempts
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) {
      logger.error({ jobId }, 'Job not found in DB');
      return;
    }

    const attempts = job.attempts + 1;

    // Check if max attempts exceeded
    if (attempts > MAX_ATTEMPTS) {
      const redis = getRedis(config.REDIS_URL);
      await moveToDeadLetter(redis, message);
      await db
        .update(jobs)
        .set({ status: 'failed', error: 'Max attempts exceeded', attempts, updated_at: new Date() })
        .where(eq(jobs.id, jobId));
      return;
    }

    // Set running with incremented attempts
    await db
      .update(jobs)
      .set({ status: 'running', attempts, updated_at: new Date() })
      .where(eq(jobs.id, jobId));

    const brandId = (payload.brand_id as string) || job.brand_id;
    const redis = getRedis(config.REDIS_URL);

    await handler({ db, redis, jobId, brandId, payload: payload as Record<string, unknown> });

    await db
      .update(jobs)
      .set({ status: 'succeeded', updated_at: new Date() })
      .where(eq(jobs.id, jobId));

    logger.info({ jobId, type, attempts }, 'Job completed successfully');
  } catch (err) {
    logger.error({ err, jobId, type }, 'Job handler failed');

    // Get current attempts from DB
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const attempts = job?.attempts || 1;

    if (attempts >= MAX_ATTEMPTS) {
      // Max attempts reached — fail permanently and move to DLQ
      await db
        .update(jobs)
        .set({
          status: 'failed',
          error: (err as Error).message,
          updated_at: new Date(),
        })
        .where(eq(jobs.id, jobId));

      const redis = getRedis(config.REDIS_URL);
      await moveToDeadLetter(redis, message);
    } else {
      // Re-enqueue for retry — mark queued AND push back to Redis
      await db
        .update(jobs)
        .set({
          status: 'queued',
          error: (err as Error).message,
          updated_at: new Date(),
        })
        .where(eq(jobs.id, jobId));

      const redis = getRedis(config.REDIS_URL);
      await enqueue(redis, { jobId, type, payload });
      logger.info({ jobId, type, attempts }, 'Re-enqueued job for retry');
    }
  }
}

async function main(): Promise<void> {
  logger.info('Quadbot worker starting...');

  // Seed prompt versions on startup (idempotent)
  await seedPrompts();

  // Register all executors for the execution loop
  registerAllExecutors();

  const redis = getRedis(config.REDIS_URL);

  // Start execution loop (polls for approved action drafts)
  const executionTimer = startExecutionLoop(db, 30000);

  // Start cron scheduler
  startCronScheduler(redis);

  // Start event processor
  const eventTimer = startEventProcessor();

  // Start job reaper (catches stuck/orphaned jobs)
  const reaperTimer = startJobReaper();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...');
    clearInterval(executionTimer);
    clearInterval(eventTimer);
    clearInterval(reaperTimer);
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start queue consumer (blocks)
  await startConsumer(redis, handleMessage);
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
