/**
 * GSC API utilities for web-side use (recommendation detail page actions).
 * Mirrors the worker's gsc-api.ts but for server-side Next.js route handlers.
 */

import { db } from '@/lib/db';
import { brandIntegrations, sharedCredentials, decrypt, encrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

type GscTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

/**
 * Load and validate GSC credentials for a brand, refreshing if expired.
 */
export async function getGscCredentials(brandId: string): Promise<{ accessToken: string; siteUrl: string } | null> {
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, 'google_search_console'),
      ),
    )
    .limit(1);

  if (!integration) return null;

  let tokens: GscTokens | null = null;

  if (integration.shared_credential_id) {
    const [shared] = await db
      .select()
      .from(sharedCredentials)
      .where(eq(sharedCredentials.id, integration.shared_credential_id))
      .limit(1);
    if (shared) {
      tokens = JSON.parse(decrypt(shared.credentials_encrypted)) as GscTokens;
    }
  } else if (integration.credentials_encrypted) {
    tokens = JSON.parse(decrypt(integration.credentials_encrypted)) as GscTokens;
  }

  if (!tokens) return null;

  // Check expiry with 5-minute buffer
  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();
  if (expiresAt.getTime() - 5 * 60 * 1000 <= now.getTime()) {
    // Refresh token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as { access_token: string; expires_in: number };
    tokens = {
      access_token: data.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };

    // Persist refreshed tokens
    const encrypted = encrypt(JSON.stringify(tokens));
    if (integration.shared_credential_id) {
      await db.update(sharedCredentials)
        .set({ credentials_encrypted: encrypted, updated_at: new Date() })
        .where(eq(sharedCredentials.id, integration.shared_credential_id));
    } else {
      await db.update(brandIntegrations)
        .set({ credentials_encrypted: encrypted, updated_at: new Date() })
        .where(eq(brandIntegrations.id, integration.id));
    }
  }

  const siteUrl = (integration.config as Record<string, unknown>)?.site_url as string || '';

  return { accessToken: tokens.access_token, siteUrl };
}

/**
 * Request indexing for a URL via Google Indexing API.
 */
export async function requestIndexing(accessToken: string, url: string) {
  const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Indexing API failed: ${error}`);
  }

  return response.json();
}

/**
 * Inspect a URL via GSC URL Inspection API.
 */
export async function inspectUrl(accessToken: string, url: string, siteUrl: string) {
  const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ inspectionUrl: url, siteUrl }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`URL Inspection API failed: ${error}`);
  }

  return response.json();
}

/**
 * Ping Google to recrawl a sitemap.
 */
export async function pingSitemap(sitemapUrl: string) {
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  const response = await fetch(pingUrl);
  return { success: response.ok };
}
