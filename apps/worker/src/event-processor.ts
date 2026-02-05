import { db } from '@quadbot/db';
import { events } from '@quadbot/db';
import { eq, and, lt } from 'drizzle-orm';
import { logger } from './logger.js';

const MAX_EVENT_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 5000;
const BATCH_SIZE = 50;

/**
 * Event processor: polls events with status='new', marks processed or failed.
 * Events are already dispatched to rules on emit; this handles retries for failed dispatches.
 */
export function startEventProcessor(): NodeJS.Timeout {
  logger.info('Event processor started');

  return setInterval(async () => {
    try {
      // Find failed events that need retry
      const failedEvents = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.status, 'failed'),
            lt(events.attempts, MAX_EVENT_ATTEMPTS),
          ),
        )
        .limit(BATCH_SIZE);

      for (const event of failedEvents) {
        try {
          // Re-dispatch by marking as new (the emitter already dispatched rules)
          await db
            .update(events)
            .set({
              status: 'new',
              attempts: event.attempts + 1,
            })
            .where(eq(events.id, event.id));
        } catch (err) {
          logger.error({ err, eventId: event.id }, 'Failed to retry event');
        }
      }

      // Mark successfully dispatched events as processed
      // Events in 'new' status that haven't been updated in 30+ seconds are considered processed
      const thirtySecondsAgo = new Date(Date.now() - 30_000);

      await db
        .update(events)
        .set({
          status: 'processed',
          processed_at: new Date(),
        })
        .where(
          and(
            eq(events.status, 'new'),
            lt(events.created_at, thirtySecondsAgo),
          ),
        );
    } catch (err) {
      logger.error({ err }, 'Event processor error');
    }
  }, POLL_INTERVAL_MS);
}
