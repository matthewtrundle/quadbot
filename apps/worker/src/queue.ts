import Redis from 'ioredis';
import { QUEUE_KEY, DLQ_KEY } from '@quadbot/shared';
import { logger } from './logger.js';

let redis: Redis | null = null;

// Per-brand concurrency limiting
const MAX_INFLIGHT_PER_BRAND = 3;
const inflight = new Map<string, number>();

export function getRedis(url: string): Redis {
  if (!redis) {
    redis = new Redis(url, { maxRetriesPerRequest: null });
    redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  }
  return redis;
}

/** Get the per-brand queue key */
export function brandQueueKey(brandId: string): string {
  return `quadbot:jobs:${brandId}`;
}

/**
 * Enqueue a job. If brandId is provided in payload, routes to brand-specific queue.
 * Falls back to global queue for backwards compatibility.
 */
export async function enqueue(redis: Redis, payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown>;
  const brandId = (p.payload as Record<string, unknown>)?.brand_id as string | undefined;

  if (brandId) {
    // Push to brand-specific queue
    await redis.lpush(brandQueueKey(brandId), JSON.stringify(payload));
    // Track brand in known brands set
    await redis.sadd('quadbot:known_brands', brandId);
  } else {
    await redis.lpush(QUEUE_KEY, JSON.stringify(payload));
  }
}

export async function moveToDeadLetter(redis: Redis, message: string): Promise<void> {
  await redis.lpush(DLQ_KEY, message);
  logger.warn({ message }, 'Message moved to DLQ');
}

/**
 * Check if a brand is at its concurrency limit.
 */
function canProcessBrand(brandId: string): boolean {
  const current = inflight.get(brandId) || 0;
  return current < MAX_INFLIGHT_PER_BRAND;
}

function incrementInflight(brandId: string): void {
  inflight.set(brandId, (inflight.get(brandId) || 0) + 1);
}

function decrementInflight(brandId: string): void {
  const current = inflight.get(brandId) || 0;
  if (current <= 1) {
    inflight.delete(brandId);
  } else {
    inflight.set(brandId, current - 1);
  }
}

/**
 * Round-robin consumer: cycles through brand queues + global queue.
 * Skips brands at concurrency capacity.
 */
export async function startConsumer(
  redis: Redis,
  handler: (message: string) => Promise<void>,
): Promise<void> {
  logger.info('Queue consumer started (multi-tenant round-robin), waiting for messages...');

  while (true) {
    try {
      // Get all known brand IDs
      const brandIds = await redis.smembers('quadbot:known_brands');

      let processed = false;

      // Round-robin through brand queues
      for (const brandId of brandIds) {
        if (!canProcessBrand(brandId)) continue;

        const result = await redis.rpop(brandQueueKey(brandId));
        if (result) {
          incrementInflight(brandId);
          try {
            await handler(result);
          } finally {
            decrementInflight(brandId);
          }
          processed = true;
        }
      }

      // Check global queue (legacy/fallback)
      const globalResult = await redis.rpop(QUEUE_KEY);
      if (globalResult) {
        await handler(globalResult);
        processed = true;
      }

      // If nothing was processed, wait before polling again to conserve Redis requests
      // With 18 brands, each cycle is ~20 Redis commands. At 5s idle interval:
      // ~345,600 requests/day idle vs 1.7M at 1s interval
      if (!processed) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (err) {
      if ((err as Error).message?.includes('Connection is closed')) {
        logger.error('Redis connection closed, stopping consumer');
        break;
      }
      // Check for rate limit errors and back off aggressively
      const errMsg = (err as Error).message || '';
      if (errMsg.includes('max requests limit exceeded')) {
        logger.error('Upstash request limit exceeded, backing off 60s');
        await new Promise((resolve) => setTimeout(resolve, 60000));
      } else {
        logger.error({ err }, 'Queue consumer error');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
