import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, brands, jobs } from '@quadbot/db';
import { eq, desc, and, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { QUEUE_KEY, DLQ_KEY, JobType } from '@quadbot/shared';
import { getRedis } from '../redis.js';

const ALL_JOB_TYPES = Object.values(JobType);

function brandQueueKey(brandId: string): string {
  return `quadbot:jobs:${brandId}`;
}

export function registerJobTools(server: McpServer) {
  server.tool(
    'trigger_job',
    'Trigger a job for a brand. Creates job row and pushes to Redis queue.',
    {
      brandId: z.string().uuid().describe('Brand UUID'),
      jobType: z.string().describe(`Job type. One of: ${ALL_JOB_TYPES.join(', ')}`),
      payload: z.record(z.unknown()).optional().describe('Additional job payload'),
    },
    async ({ brandId, jobType, payload }) => {
      if (!ALL_JOB_TYPES.includes(jobType as any)) {
        return {
          content: [{ type: 'text', text: `Invalid job type: ${jobType}. Valid types: ${ALL_JOB_TYPES.join(', ')}` }],
          isError: true,
        };
      }

      // Verify brand exists
      const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
      if (!brand) {
        return { content: [{ type: 'text', text: 'Brand not found' }], isError: true };
      }

      const jobId = randomUUID();
      await db.insert(jobs).values({
        id: jobId,
        brand_id: brandId,
        type: jobType,
        status: 'queued',
        payload: payload || {},
      });

      // Push to per-brand Redis queue
      const redis = getRedis();
      const message = JSON.stringify({
        jobId,
        type: jobType,
        payload: { brand_id: brandId, ...payload },
      });
      await redis.lpush(brandQueueKey(brandId), message);
      await redis.sadd('quadbot:known_brands', brandId);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, jobId, jobType, brandId, brandName: brand.name }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'get_job_status',
    'Check job status, result, and error details',
    { jobId: z.string().uuid().describe('Job UUID') },
    async ({ jobId }) => {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (!job) {
        return { content: [{ type: 'text', text: 'Job not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] };
    },
  );

  server.tool(
    'list_recent_jobs',
    'List recent jobs with optional filters',
    {
      brandId: z.string().uuid().optional().describe('Filter by brand'),
      status: z.enum(['queued', 'running', 'succeeded', 'failed']).optional().describe('Filter by status'),
      type: z.string().optional().describe('Filter by job type'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, status, type, limit }) => {
      const conditions = [];
      if (brandId) conditions.push(eq(jobs.brand_id, brandId));
      if (status) conditions.push(eq(jobs.status, status));
      if (type) conditions.push(eq(jobs.type, type));

      const results = await db
        .select()
        .from(jobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(jobs.created_at))
        .limit(limit || 20);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'peek_queue',
    'Peek at pending items in Redis queue for a brand (or global queue)',
    {
      brandId: z.string().uuid().optional().describe('Brand UUID (omit for global queue)'),
      count: z.number().min(1).max(50).optional().describe('Number of items to peek (default 10)'),
    },
    async ({ brandId, count }) => {
      const redis = getRedis();
      const key = brandId ? brandQueueKey(brandId) : QUEUE_KEY;
      const items = await redis.lrange(key, 0, (count || 10) - 1);
      const queueLength = await redis.llen(key);

      const parsed = items.map((item) => {
        try { return JSON.parse(item); } catch { return item; }
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ queue: key, total: queueLength, items: parsed }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'peek_dlq',
    'Peek at failed items in the dead letter queue',
    {
      count: z.number().min(1).max(50).optional().describe('Number of items to peek (default 10)'),
    },
    async ({ count }) => {
      const redis = getRedis();
      const items = await redis.lrange(DLQ_KEY, 0, (count || 10) - 1);
      const queueLength = await redis.llen(DLQ_KEY);

      const parsed = items.map((item) => {
        try { return JSON.parse(item); } catch { return item; }
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ queue: DLQ_KEY, total: queueLength, items: parsed }, null, 2),
        }],
      };
    },
  );
}
