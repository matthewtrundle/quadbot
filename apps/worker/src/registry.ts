import { JobType } from '@quadbot/shared';
import type { Database } from '@quadbot/db';
import type Redis from 'ioredis';
import { logger } from './logger.js';

export type JobContext = {
  db: Database;
  redis: Redis;
  jobId: string;
  brandId: string;
  payload: Record<string, unknown>;
};

export type JobHandler = (ctx: JobContext) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
  logger.debug({ type }, 'Registered job handler');
}

export function getHandler(type: string): JobHandler | undefined {
  return handlers.get(type);
}

export function getRegisteredTypes(): string[] {
  return Array.from(handlers.keys());
}
