import { notifications, brandIntegrations, decrypt } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger.js';
import { sendSlackNotification } from './slack-notifier.js';
import { sendDiscordNotification } from './discord-notifier.js';

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
 * Also dispatches to Slack/Discord webhooks if configured (fire-and-forget).
 */
export async function sendNotification(db: Database, notification: NotificationPayload): Promise<void> {
  try {
    await db.insert(notifications).values({
      brand_id: notification.brand_id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data ?? {},
    });
    logger.info({ brandId: notification.brand_id, type: notification.type }, 'Notification created');

    // Dispatch to Slack/Discord webhooks (fire-and-forget)
    dispatchWebhookNotifications(db, notification).catch((err) => {
      logger.warn({ err }, 'Failed to dispatch webhook notifications');
    });
  } catch (err) {
    logger.error({ err, notification }, 'Failed to create notification');
  }
}

/**
 * Load Slack/Discord webhook URLs and send notifications.
 * Non-blocking — errors are logged but never propagated.
 */
async function dispatchWebhookNotifications(db: Database, notification: NotificationPayload): Promise<void> {
  const integrations = await db
    .select()
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, notification.brand_id)));

  const webhookPayload = {
    title: notification.title,
    body: notification.body,
    priority: (notification.data?.priority as string) || 'medium',
    source: notification.type,
    brandName: (notification.data?.brand_name as string) || 'QuadBot',
  };

  for (const integration of integrations) {
    if (integration.type === 'slack_webhook' && integration.credentials_encrypted) {
      try {
        const creds = JSON.parse(decrypt(integration.credentials_encrypted));
        if (creds.webhook_url) {
          sendSlackNotification(creds.webhook_url, webhookPayload).catch(() => {});
        }
      } catch {
        // Skip if credentials can't be decrypted
      }
    }

    if (integration.type === 'discord_webhook' && integration.credentials_encrypted) {
      try {
        const creds = JSON.parse(decrypt(integration.credentials_encrypted));
        if (creds.webhook_url) {
          sendDiscordNotification(creds.webhook_url, webhookPayload).catch(() => {});
        }
      } catch {
        // Skip if credentials can't be decrypted
      }
    }
  }
}
