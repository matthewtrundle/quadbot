import { vi } from 'vitest';

/**
 * Creates a mock Redis (ioredis-compatible) object.
 *
 * Usage:
 *   const redis = createMockRedis();
 *   redis.get.mockResolvedValue('cached-value');
 */
export function createMockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    lpush: vi.fn().mockResolvedValue(1),
    rpush: vi.fn().mockResolvedValue(1),
    lpop: vi.fn().mockResolvedValue(null),
    rpop: vi.fn().mockResolvedValue(null),
    lrange: vi.fn().mockResolvedValue([]),
    llen: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    incr: vi.fn().mockResolvedValue(1),
    zadd: vi.fn().mockResolvedValue(1),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    pipeline: vi.fn().mockReturnValue({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
    disconnect: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
  };
}

export type MockRedis = ReturnType<typeof createMockRedis>;
