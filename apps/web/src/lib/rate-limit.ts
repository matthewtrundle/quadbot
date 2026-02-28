import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

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
  identifier: string,
  { maxRequests = 60, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `quadbot:rate_limit:${identifier}`;

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

/**
 * Extract a rate limit identifier from the request.
 * Uses IP address as the identifier for rate limiting.
 */
function getClientIdentifier(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Context object passed to Next.js route handlers (e.g. dynamic route params). */
type RouteContext = { params: Promise<Record<string, string>> };

/* eslint-disable @typescript-eslint/no-explicit-any -- RouteHandler must accept varied param shapes from Next.js dynamic routes */
type RouteHandler = (
  req: NextRequest,
  context: any,
) => Promise<NextResponse> | NextResponse;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Wrap an API route handler with rate limiting.
 * Applies per-IP rate limiting using a sliding window.
 *
 * @param handler - The route handler to wrap
 * @param opts - Rate limit options
 * @param opts.maxRequests - Max requests per window (default: 30 for mutations)
 * @param opts.windowMs - Window size in ms (default: 60000)
 */
export function withRateLimit<T extends RouteHandler>(
  handler: T,
  opts: { maxRequests?: number; windowMs?: number } = {},
): T {
  const { maxRequests = 30, windowMs = 60_000 } = opts;

  const wrapped = async (req: NextRequest, context: RouteContext) => {
    try {
      const identifier = getClientIdentifier(req);
      const result = await checkRateLimit(identifier, { maxRequests, windowMs });

      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Too many requests' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
              'X-RateLimit-Limit': String(maxRequests),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(result.resetAt),
            },
          },
        );
      }

      const response = await handler(req, context);
      return response;
    } catch {
      // If rate limiting fails (Redis down), allow the request through
      return handler(req, context);
    }
  };

  return wrapped as T;
}
