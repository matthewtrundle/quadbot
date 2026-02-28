import http from 'node:http';
import { db } from '@quadbot/db';
import { sql } from 'drizzle-orm';
import { QUEUE_KEY, DLQ_KEY } from '@quadbot/shared';
import { getRedis, brandQueueKey } from './queue.js';
import { config } from './config.js';
import { logger } from './logger.js';

const startedAt = Date.now();
let lastJobCompletedAt: number | null = null;

/** Called by handleMessage after a job completes to update the health timestamp */
export function recordJobCompletion(): void {
  lastJobCompletedAt = Date.now();
}

export function startHealthServer(port: number): http.Server {
  const server = http.createServer(async (_req, res) => {
    try {
      // Check DB
      await db.execute(sql`SELECT 1`);

      // Check Redis
      const redis = getRedis(config.REDIS_URL);
      await redis.ping();

      // Gather queue stats
      const brandIds = await redis.smembers('quadbot:known_brands');
      let totalQueueDepth = 0;
      for (const brandId of brandIds) {
        totalQueueDepth += await redis.llen(brandQueueKey(brandId));
      }
      totalQueueDepth += await redis.llen(QUEUE_KEY);
      const dlqDepth = await redis.llen(DLQ_KEY);

      // Memory usage
      const mem = process.memoryUsage();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        db: true,
        redis: true,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        queue_depth: totalQueueDepth,
        dlq_depth: dlqDepth,
        brands_tracked: brandIds.length,
        last_job_completed_at: lastJobCompletedAt ? new Date(lastJobCompletedAt).toISOString() : null,
        memory: {
          rss_mb: Math.round(mem.rss / 1024 / 1024),
          heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        },
      }));
    } catch (err) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        error: (err as Error).message,
      }));
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Health server listening');
  });

  return server;
}
