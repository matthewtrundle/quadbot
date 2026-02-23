import { Resend } from 'resend';
import { decrypt } from '@quadbot/db';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';

// Cache Resend instances per account to avoid re-instantiating
const clientCache = new Map<string, Resend>();

export function getResendClient(accountId: string, encryptedApiKey: string): Resend {
  const cached = clientCache.get(accountId);
  if (cached) return cached;

  const apiKey = decrypt(encryptedApiKey);
  const client = new Resend(apiKey);
  clientCache.set(accountId, client);
  return client;
}

export function clearResendClient(accountId: string): void {
  clientCache.delete(accountId);
}

/**
 * Generate an RFC 2822 compliant Message-ID.
 * Format: <uuid@domain>
 */
export function generateMessageId(domain: string): string {
  const localPart = randomUUID();
  return `<${localPart}@${domain}>`;
}

export type SendOutreachEmailOptions = {
  accountId: string;
  encryptedApiKey: string;
  from: { email: string; name: string };
  to: string;
  subject: string;
  html: string;
  text?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
};

export type SendOutreachEmailResult = {
  resendMessageId: string;
};

/**
 * Send an outreach email via Resend with custom headers for threading.
 */
export async function sendOutreachEmail(
  options: SendOutreachEmailOptions,
): Promise<SendOutreachEmailResult> {
  const client = getResendClient(options.accountId, options.encryptedApiKey);

  const headers: Record<string, string> = {
    'Message-ID': options.messageId,
  };

  if (options.inReplyTo) {
    headers['In-Reply-To'] = options.inReplyTo;
  }
  if (options.references) {
    headers['References'] = options.references;
  }

  const result = await client.emails.send({
    from: `${options.from.name} <${options.from.email}>`,
    to: [options.to],
    subject: options.subject,
    html: options.html,
    text: options.text,
    headers,
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }

  logger.info(
    { resendId: result.data?.id, to: options.to },
    'Outreach email sent via Resend',
  );

  return { resendMessageId: result.data!.id };
}
