import { db } from '@/lib/db';
import { events } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

/**
 * Emit an event from the web API layer.
 * Lightweight version - does not dispatch rules (worker handles that).
 */
export async function emitEvent(
  type: string,
  brandId: string,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
  source: string = 'api',
): Promise<string | null> {
  try {
    if (dedupeKey) {
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

      if (existing.length > 0) return null;
    }

    const eventId = randomUUID();
    await db.insert(events).values({
      id: eventId,
      brand_id: brandId,
      type,
      payload,
      source,
      dedupe_key: dedupeKey || undefined,
      status: 'new',
    });

    return eventId;
  } catch (err) {
    if ((err as any)?.code === '23505') return null;
    throw err;
  }
}
