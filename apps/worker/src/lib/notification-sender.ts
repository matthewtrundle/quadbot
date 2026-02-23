import { notifications } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { logger } from '../logger.js';

export interface NotificationPayload {
  brand_id: string;
  type: 'execution_completed' | 'execution_failed' | 'approval_needed' | 'daily_digest' | 'safety_blocked';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Create a notification for a brand.
 * Inserts into the notifications table for in-app display.
 * Future: email via Resend, Slack webhook.
 */
export async function sendNotification(
  db: Database,
  notification: NotificationPayload,
): Promise<void> {
  try {
    await db.insert(notifications).values({
      brand_id: notification.brand_id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data ?? {},
    });
    logger.info(
      { brandId: notification.brand_id, type: notification.type },
      'Notification created',
    );
  } catch (err) {
    logger.error({ err, notification }, 'Failed to create notification');
  }
}
