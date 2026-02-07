import { db } from '@quadbot/db';
import { jobs } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { queuePayloadSchema, MAX_ATTEMPTS, JobType } from '@quadbot/shared';
import { config } from './config.js';
import { logger } from './logger.js';
import { getRedis, startConsumer, moveToDeadLetter, closeRedis } from './queue.js';
import { registerHandler, getHandler } from './registry.js';
import { startExecutionLoop } from './execution-loop.js';
import { startCronScheduler } from './cron.js';
import { startEventProcessor } from './event-processor.js';
import { seedPrompts } from './seed-prompts.js';
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
    logger.error({ err, message }, 'Failed to parse queue message');
    return;
  }

  const { jobId, type, payload } = parsed;
  const handler = getHandler(type);

  if (!handler) {
    logger.error({ type }, 'No handler registered for job type');
    return;
  }

  try {
    // Increment attempts and set running
    await db
      .update(jobs)
      .set({ status: 'running', attempts: (payload as any).attempts ?? 1, updated_at: new Date() })
      .where(eq(jobs.id, jobId));

    // Get job to check attempts
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) {
      logger.error({ jobId }, 'Job not found in DB');
      return;
    }

    if (job.attempts > MAX_ATTEMPTS) {
      const redis = getRedis(config.REDIS_URL);
      await moveToDeadLetter(redis, message);
      await db
        .update(jobs)
        .set({ status: 'failed', error: 'Max attempts exceeded', updated_at: new Date() })
        .where(eq(jobs.id, jobId));
      return;
    }

    const brandId = (payload.brand_id as string) || job.brand_id;
    const redis = getRedis(config.REDIS_URL);

    await handler({ db, redis, jobId, brandId, payload: payload as Record<string, unknown> });

    await db
      .update(jobs)
      .set({ status: 'succeeded', updated_at: new Date() })
      .where(eq(jobs.id, jobId));

    logger.info({ jobId, type }, 'Job completed successfully');
  } catch (err) {
    logger.error({ err, jobId, type }, 'Job handler failed');

    // Increment attempts
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const attempts = (job?.attempts || 0) + 1;

    await db
      .update(jobs)
      .set({
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
        attempts,
        error: (err as Error).message,
        updated_at: new Date(),
      })
      .where(eq(jobs.id, jobId));

    if (attempts >= MAX_ATTEMPTS) {
      const redis = getRedis(config.REDIS_URL);
      await moveToDeadLetter(redis, message);
    }
  }
}

async function main(): Promise<void> {
  logger.info('Quadbot worker starting...');

  // Seed prompt versions on startup (idempotent)
  await seedPrompts();

  const redis = getRedis(config.REDIS_URL);

  // Start execution loop (polls for approved action drafts)
  const executionTimer = startExecutionLoop(db, 30000);

  // Start cron scheduler
  startCronScheduler(redis);

  // Start event processor
  const eventTimer = startEventProcessor();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...');
    clearInterval(executionTimer);
    clearInterval(eventTimer);
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
