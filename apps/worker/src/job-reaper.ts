import { db } from '@quadbot/db';
import { jobs } from '@quadbot/db';
import { eq, and, lt, sql } from 'drizzle-orm';
import { logger } from './logger.js';

const POLL_INTERVAL_MS = 60_000; // Check every minute
const RUNNING_TIMEOUT_MS = 30 * 60_000; // 30 minutes stuck in 'running'
const QUEUED_STALE_MS = 10 * 60_000; // 10 minutes stuck in 'queued' with attempts > 0

/**
 * Reaps stale jobs that are stuck in 'running' or 'queued' states.
 *
 * - Jobs stuck in 'running' for >30 min are marked 'failed' (worker likely crashed).
 * - Jobs stuck in 'queued' with attempts > 0 for >10 min are marked 'failed'
 *   (re-enqueue was lost or worker died mid-retry).
 */
export function startJobReaper(): NodeJS.Timeout {
  logger.info('Job reaper started');

  return setInterval(async () => {
    try {
      const now = new Date();

      // Reap jobs stuck in 'running'
      const runningCutoff = new Date(now.getTime() - RUNNING_TIMEOUT_MS);
      const staleRunning = await db
        .update(jobs)
        .set({
          status: 'failed',
          error: 'Reaped: stuck in running state for >30 minutes',
          updated_at: now,
        })
        .where(
          and(
            eq(jobs.status, 'running'),
            lt(jobs.updated_at, runningCutoff),
          ),
        )
        .returning({ id: jobs.id, type: jobs.type, brandId: jobs.brand_id });

      if (staleRunning.length > 0) {
        logger.warn(
          { count: staleRunning.length, jobs: staleRunning },
          'Reaped stale running jobs',
        );
      }

      // Reap jobs stuck in 'queued' with attempts > 0 (orphaned retries)
      const queuedCutoff = new Date(now.getTime() - QUEUED_STALE_MS);
      const staleQueued = await db
        .update(jobs)
        .set({
          status: 'failed',
          error: 'Reaped: stuck in queued state with prior attempts for >10 minutes',
          updated_at: now,
        })
        .where(
          and(
            eq(jobs.status, 'queued'),
            lt(jobs.updated_at, queuedCutoff),
            sql`${jobs.attempts} > 0`,
          ),
        )
        .returning({ id: jobs.id, type: jobs.type, brandId: jobs.brand_id });

      if (staleQueued.length > 0) {
        logger.warn(
          { count: staleQueued.length, jobs: staleQueued },
          'Reaped stale queued jobs (orphaned retries)',
        );
      }
    } catch (err) {
      logger.error({ err }, 'Job reaper tick failed');
    }
  }, POLL_INTERVAL_MS);
}
