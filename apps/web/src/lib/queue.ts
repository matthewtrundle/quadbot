import { Redis } from '@upstash/redis';
import { QUEUE_KEY } from '@quadbot/shared';

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

export async function enqueueJob(payload: {
  jobId: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await getRedis().lpush(QUEUE_KEY, JSON.stringify(payload));
}
