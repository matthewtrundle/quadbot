import http from 'node:http';
import { db } from '@quadbot/db';
import { sql } from 'drizzle-orm';
import { getRedis } from './queue.js';
import { config } from './config.js';
import { logger } from './logger.js';

const startedAt = Date.now();

export function startHealthServer(port: number): http.Server {
  const server = http.createServer(async (_req, res) => {
    try {
      // Check DB
      await db.execute(sql`SELECT 1`);

      // Check Redis
      const redis = getRedis(config.REDIS_URL);
      await redis.ping();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        db: true,
        redis: true,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
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
