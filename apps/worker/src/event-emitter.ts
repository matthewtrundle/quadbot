import { db } from '@quadbot/db';
import { events, eventRules, jobs } from '@quadbot/db';
import { eq, and, or, isNull } from 'drizzle-orm';
import { enqueue } from './queue.js';
import { getRedis } from './queue.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { randomUUID } from 'node:crypto';

/**
 * Emit an event with idempotency via dedupe_key.
 * ON CONFLICT DO NOTHING on (brand_id, type, dedupe_key).
 * After writing, dispatches matching event rules to create jobs.
 */
export async function emitEvent(
  type: string,
  brandId: string,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
  source?: string,
): Promise<string | null> {
  try {
    // Insert event with dedupe guard
    const eventId = randomUUID();

    if (dedupeKey) {
      // Check if event with this dedupe key already exists
      const existing = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.brand_id, brandId),
            eq(events.type, type),
            eq(events.dedupe_key, dedupeKey),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        logger.debug({ type, brandId, dedupeKey }, 'Event deduplicated, skipping');
        return null;
      }
    }

    await db.insert(events).values({
      id: eventId,
      brand_id: brandId,
      type,
      payload,
      source: source || undefined,
      dedupe_key: dedupeKey || undefined,
      status: 'new',
    });

    logger.info({ eventId, type, brandId, dedupeKey }, 'Event emitted');

    // Dispatch matching event rules
    await dispatchEventRules(eventId, type, brandId, payload);

    return eventId;
  } catch (err) {
    // Unique constraint violation = duplicate event, safe to ignore
    if ((err as any)?.code === '23505') {
      logger.debug({ type, brandId, dedupeKey }, 'Event deduplicated via constraint');
      return null;
    }
    logger.error({ err, type, brandId }, 'Failed to emit event');
    throw err;
  }
}

/**
 * Find matching event rules and enqueue corresponding jobs.
 */
async function dispatchEventRules(
  eventId: string,
  eventType: string,
  brandId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Find rules matching this event type (brand-specific or global)
  const rules = await db
    .select()
    .from(eventRules)
    .where(
      and(
        eq(eventRules.event_type, eventType),
        eq(eventRules.enabled, true),
        or(eq(eventRules.brand_id, brandId), isNull(eventRules.brand_id)),
      ),
    );

  if (rules.length === 0) return;

  const redis = getRedis(config.REDIS_URL);

  for (const rule of rules) {
    const jobId = randomUUID();

    await db.insert(jobs).values({
      id: jobId,
      brand_id: brandId,
      type: rule.job_type,
      status: 'queued',
      payload: { ...payload, _event_id: eventId, _event_type: eventType },
    });

    await enqueue(redis, {
      jobId,
      type: rule.job_type,
      payload: { brand_id: brandId, ...payload, _event_id: eventId },
    });

    logger.info(
      { eventId, ruleId: rule.id, jobType: rule.job_type, brandId },
      'Event rule triggered, job enqueued',
    );
  }
}
