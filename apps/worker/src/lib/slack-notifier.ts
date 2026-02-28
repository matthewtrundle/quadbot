import { logger } from '../logger.js';

export interface SlackNotification {
  title: string;
  body: string;
  priority: string;
  source: string;
  brandName: string;
  url?: string;
}

const PRIORITY_EMOJI: Record<string, string> = {
  critical: ':rotating_light:',
  high: ':warning:',
  medium: ':large_blue_circle:',
  low: ':white_circle:',
};

/**
 * Format a notification as Slack Block Kit blocks.
 */
export function formatSlackBlocks(notification: SlackNotification): object {
  const emoji = PRIORITY_EMOJI[notification.priority] || ':bell:';

  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${notification.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: notification.body.slice(0, 2900), // Slack limit ~3000 chars
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Brand:* ${notification.brandName} | *Source:* ${notification.source} | *Priority:* ${notification.priority}`,
        },
      ],
    },
  ];

  if (notification.url) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in QuadBot', emoji: true },
          url: notification.url,
        },
      ],
    });
  }

  return { blocks };
}

/**
 * Validate a Slack webhook URL.
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'hooks.slack.com' && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Send a notification to a Slack webhook.
 * Fire-and-forget — never throws, only logs errors.
 */
export async function sendSlackNotification(webhookUrl: string, notification: SlackNotification): Promise<boolean> {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    logger.warn({ webhookUrl: webhookUrl.slice(0, 50) }, 'Invalid Slack webhook URL');
    return false;
  }

  try {
    const payload = formatSlackBlocks(notification);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, body: await response.text() }, 'Slack webhook delivery failed');
      return false;
    }

    logger.debug({ brandName: notification.brandName }, 'Slack notification sent');
    return true;
  } catch (err) {
    logger.warn({ err }, 'Slack webhook request failed');
    return false;
  }
}
