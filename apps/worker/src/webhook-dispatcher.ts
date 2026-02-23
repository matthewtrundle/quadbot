import { db } from '@quadbot/db';
import { webhooks } from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { logger } from './logger.js';

type WebhookPayload = {
  event: string;
  brand_id: string;
  timestamp: string;
  data: Record<string, unknown>;
};

const MAX_FAILURES = 10; // Disable webhook after 10 consecutive failures

/**
 * Dispatches outgoing webhooks for a given event.
 * Called from the event processor when events are emitted.
 *
 * Non-blocking: fires and forgets, logs errors but doesn't throw.
 */
export async function dispatchWebhooks(
  brandId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    // Find active webhooks for this brand that subscribe to this event type
    const activeWebhooks = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.brand_id, brandId),
        eq(webhooks.is_active, true),
      ));

    // Filter to webhooks that subscribe to this event type
    const matching = activeWebhooks.filter((wh) => {
      const eventTypes = wh.event_types as string[];
      return eventTypes.length === 0 || eventTypes.includes(eventType) || eventTypes.includes('*');
    });

    if (matching.length === 0) return;

    const payload: WebhookPayload = {
      event: eventType,
      brand_id: brandId,
      timestamp: new Date().toISOString(),
      data,
    };

    const body = JSON.stringify(payload);

    // Fire all webhooks concurrently
    const results = await Promise.allSettled(
      matching.map((wh) => sendWebhook(wh, body)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const wh = matching[i];

      if (result.status === 'fulfilled') {
        // Reset failure count on success
        await db.update(webhooks)
          .set({
            last_triggered_at: new Date(),
            failure_count: 0,
            updated_at: new Date(),
          })
          .where(eq(webhooks.id, wh.id));
      } else {
        // Increment failure count
        const newCount = wh.failure_count + 1;
        await db.update(webhooks)
          .set({
            failure_count: newCount,
            is_active: newCount < MAX_FAILURES,
            updated_at: new Date(),
          })
          .where(eq(webhooks.id, wh.id));

        logger.warn({
          webhookId: wh.id,
          url: wh.url,
          eventType,
          failureCount: newCount,
          error: result.reason?.message,
        }, newCount >= MAX_FAILURES
          ? 'Webhook disabled after too many failures'
          : 'Webhook delivery failed');
      }
    }
  } catch (err) {
    logger.error({ err, brandId, eventType }, 'Webhook dispatcher error');
  }
}

async function sendWebhook(
  wh: { id: string; url: string; secret: string | null },
  body: string,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'QuadBot-Webhook/1.0',
  };

  // HMAC signature if secret is configured
  if (wh.secret) {
    const signature = createHmac('sha256', wh.secret)
      .update(body)
      .digest('hex');
    headers['X-QuadBot-Signature'] = `sha256=${signature}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(wh.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
