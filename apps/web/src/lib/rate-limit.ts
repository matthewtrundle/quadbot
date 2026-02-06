import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
};

/**
 * Sliding window rate limiter using Redis.
 * Per-brand buckets with configurable window and max requests.
 */
export async function checkRateLimit(
  brandId: string,
  { maxRequests = 60, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `quadbot:rate_limit:${brandId}`;

  // Use a sorted set: score = timestamp, member = unique request id
  const requestId = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  // Pipeline: remove old entries, add new entry, count, set TTL
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, { score: now, member: requestId });
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const count = (results[2] as number) || 0;

  const allowed = count <= maxRequests;
  const remaining = Math.max(0, maxRequests - count);
  const resetAt = now + windowMs;

  return { allowed, remaining, resetAt };
}
