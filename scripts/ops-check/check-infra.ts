import { db, brands, encrypt, decrypt } from '@quadbot/db';
import Redis from 'ioredis';
import { pass, fail, skip } from './lib/helpers.js';

export async function checkInfra() {
  // 1. PostgreSQL connection
  try {
    const result = await db.select().from(brands).limit(1);
    pass('Infrastructure', `DB connection (${result.length >= 0 ? 'OK' : 'empty'})`);
  } catch (err: any) {
    fail('Infrastructure', 'DB connection', err.message);
  }

  // 2. Redis via ioredis native
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
      await redis.ping();
      pass('Infrastructure', 'Redis (ioredis native)');
      await redis.quit();
    } catch (err: any) {
      fail('Infrastructure', 'Redis (ioredis native)', err.message);
    }
  } else {
    skip('Infrastructure', 'Redis (ioredis) - REDIS_URL not set');
  }

  // 3. Redis via Upstash REST
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      const res = await fetch(`${upstashUrl}/ping`, {
        headers: { Authorization: `Bearer ${upstashToken}` },
      });
      if (res.ok) {
        pass('Infrastructure', 'Redis (Upstash REST)');
      } else {
        fail('Infrastructure', 'Redis (Upstash REST)', `HTTP ${res.status}`);
      }
    } catch (err: any) {
      fail('Infrastructure', 'Redis (Upstash REST)', err.message);
    }
  } else {
    skip('Infrastructure', 'Redis (Upstash REST) - credentials not set');
  }

  // 4. Encryption round-trip
  try {
    const testValue = 'ops_check_encryption_test';
    const encrypted = encrypt(testValue);
    const decrypted = decrypt(encrypted);
    if (decrypted === testValue) {
      pass('Infrastructure', 'Encryption round-trip');
    } else {
      fail('Infrastructure', 'Encryption round-trip', 'Decrypted value mismatch');
    }
  } catch (err: any) {
    fail('Infrastructure', 'Encryption round-trip', err.message);
  }

  // 5. Env var presence
  const required = ['DATABASE_URL', 'REDIS_URL', 'ENCRYPTION_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length === 0) {
    pass('Infrastructure', 'Required env vars present');
  } else {
    fail('Infrastructure', 'Required env vars', `Missing: ${missing.join(', ')}`);
  }
}
