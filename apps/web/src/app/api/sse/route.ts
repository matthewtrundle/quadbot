import { NextRequest } from 'next/server';
import { getSession, type UserWithBrand } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * SSE endpoint for real-time dashboard updates.
 * Polls Redis list for events and streams them to connected clients.
 * Falls back to heartbeat-only if no Redis URL configured.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const brandId = req.nextUrl.searchParams.get('brandId') || userBrandId;

  if (!brandId) {
    return new Response('brandId required', { status: 400 });
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ brandId, ts: Date.now() })}\n\n`));

      // Heartbeat every 30 seconds
      heartbeatId = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 30_000);

      // Poll for events every 2 seconds
      intervalId = setInterval(async () => {
        if (closed) return;

        try {
          const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
          if (!redisUrl) return;

          // Use fetch for Upstash REST API if URL starts with https
          const queueKey = `quadbot:sse_events:${brandId}`;

          if (redisUrl.startsWith('https://')) {
            // Upstash REST API: RPOP
            const restUrl = redisUrl.replace(/\/$/, '');
            const token = process.env.UPSTASH_REDIS_TOKEN || '';
            const response = await fetch(`${restUrl}/rpop/${queueKey}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = (await response.json()) as { result: string | null };
            if (data.result) {
              controller.enqueue(encoder.encode(`event: update\ndata: ${data.result}\n\n`));
            }
          } else {
            // Standard Redis — use dynamic import
            // For standard Redis connections in non-serverless environments
            const { default: Redis } = await import('ioredis');
            const redis = new Redis(redisUrl);
            const event = await redis.rpop(queueKey);
            await redis.quit();
            if (event) {
              controller.enqueue(encoder.encode(`event: update\ndata: ${event}\n\n`));
            }
          }
        } catch {
          // Silently skip on Redis errors — SSE continues with heartbeat
        }
      }, 2000);
    },
    cancel() {
      closed = true;
      if (intervalId) clearInterval(intervalId);
      if (heartbeatId) clearInterval(heartbeatId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
