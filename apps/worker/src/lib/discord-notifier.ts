import { logger } from '../logger.js';

export interface DiscordNotification {
  title: string;
  body: string;
  priority: string;
  source: string;
  brandName: string;
  url?: string;
}

const PRIORITY_COLORS: Record<string, number> = {
  critical: 0xed4245, // red
  high: 0xffa500, // orange
  medium: 0xfee75c, // yellow
  low: 0x57f287, // green
};

/**
 * Format a notification as a Discord embed.
 */
export function formatDiscordEmbed(notification: DiscordNotification): object {
  const color = PRIORITY_COLORS[notification.priority] || 0x5865f2; // blurple default

  const embed: Record<string, unknown> = {
    title: notification.title,
    description: notification.body.slice(0, 4000), // Discord limit ~4096 chars
    color,
    fields: [
      { name: 'Brand', value: notification.brandName, inline: true },
      { name: 'Source', value: notification.source, inline: true },
      { name: 'Priority', value: notification.priority.toUpperCase(), inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: 'QuadBot' },
  };

  if (notification.url) {
    embed.url = notification.url;
  }

  return { embeds: [embed] };
}

/**
 * Validate a Discord webhook URL.
 */
export function isValidDiscordWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'discord.com' && parsed.pathname.startsWith('/api/webhooks') && parsed.protocol === 'https:'
    );
  } catch {
    return false;
  }
}

/**
 * Send a notification to a Discord webhook.
 * Fire-and-forget — never throws, only logs errors.
 */
export async function sendDiscordNotification(webhookUrl: string, notification: DiscordNotification): Promise<boolean> {
  if (!isValidDiscordWebhookUrl(webhookUrl)) {
    logger.warn({ webhookUrl: webhookUrl.slice(0, 50) }, 'Invalid Discord webhook URL');
    return false;
  }

  try {
    const payload = formatDiscordEmbed(notification);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, body: await response.text() }, 'Discord webhook delivery failed');
      return false;
    }

    logger.debug({ brandName: notification.brandName }, 'Discord notification sent');
    return true;
  } catch (err) {
    logger.warn({ err }, 'Discord webhook request failed');
    return false;
  }
}
