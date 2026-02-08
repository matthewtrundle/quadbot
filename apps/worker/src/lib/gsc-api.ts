/**
 * Google Search Console API utilities for the worker
 */

import { brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger.js';

export type GscTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

/**
 * Load GSC credentials for a brand integration.
 * Supports both direct credentials and shared credentials.
 */
export async function loadGscCredentials(
  db: Database,
  brandId: string,
): Promise<GscTokens | null> {
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

  if (!integration) {
    return null;
  }

  // Check for shared credentials first
  if (integration.shared_credential_id) {
    const [shared] = await db
      .select()
      .from(sharedCredentials)
      .where(eq(sharedCredentials.id, integration.shared_credential_id))
      .limit(1);

    if (shared) {
      return JSON.parse(decrypt(shared.credentials_encrypted)) as GscTokens;
    }
  }

  // Fall back to direct credentials
  if (integration.credentials_encrypted) {
    return JSON.parse(decrypt(integration.credentials_encrypted)) as GscTokens;
  }

  return null;
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GscTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Get a valid access token, refreshing and persisting if needed
 */
export async function getValidAccessToken(
  db: Database,
  brandId: string,
): Promise<string | null> {
  const credentials = await loadGscCredentials(db, brandId);
  if (!credentials) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  const expiresAt = new Date(credentials.expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > now.getTime()) {
    return credentials.access_token;
  }

  // Token expired, refresh it
  logger.info({ brandId }, 'Refreshing expired GSC access token');
  try {
    const newTokens = await refreshAccessToken(credentials.refresh_token);

    // Persist refreshed tokens back to database
    const { persistRefreshedTokens } = await import('./token-persistence.js');
    await persistRefreshedTokens(db, brandId, 'google_search_console', newTokens);

    return newTokens.access_token;
  } catch (error) {
    logger.error({ brandId, error }, 'Failed to refresh access token');
    return null;
  }
}

/**
 * Submit a URL to Google Indexing API
 * Note: Requires service account with Indexing API permissions
 */
type IndexingApiResponse = {
  urlNotificationMetadata?: {
    url: string;
    latestUpdate?: { type: string };
  };
};

export async function submitUrlToIndexingApi(
  accessToken: string,
  url: string,
  action: 'URL_UPDATED' | 'URL_DELETED',
): Promise<IndexingApiResponse> {
  const response = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      url,
      type: action,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Indexing API request failed: ${error}`);
  }

  return response.json() as Promise<IndexingApiResponse>;
}

type UrlInspectionResponse = {
  inspectionResult?: {
    indexStatusResult?: {
      verdict: string;
      coverageState: string;
      robotsTxtState: string;
      indexingState: string;
      lastCrawlTime?: string;
      pageFetchState: string;
      googleCanonical?: string;
      userCanonical?: string;
    };
    mobileUsabilityResult?: {
      verdict: string;
      issues?: Array<{ issueType: string; severity: string; message: string }>;
    };
    richResultsResult?: {
      verdict: string;
      detectedItems?: Array<{ richResultType: string }>;
    };
  };
};

/**
 * Inspect a URL using GSC URL Inspection API
 */
export async function inspectUrl(
  accessToken: string,
  inspectionUrl: string,
  siteUrl: string,
): Promise<UrlInspectionResponse> {
  const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      inspectionUrl,
      siteUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`URL Inspection API request failed: ${error}`);
  }

  return response.json() as Promise<UrlInspectionResponse>;
}

/**
 * Fetch search analytics data from Google Search Console API.
 * Returns an array of query-level metrics matching the fixture data format.
 */
export type GscQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function fetchGscSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscQueryRow[]> {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 500,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GSC Search Analytics API failed: ${error}`);
  }

  const data = await response.json() as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };

  if (!data.rows || data.rows.length === 0) {
    return [];
  }

  return data.rows.map((row) => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

/**
 * Ping Google to recrawl a sitemap
 * Uses the simple ping endpoint
 */
export async function pingSitemap(sitemapUrl: string): Promise<{ success: boolean }> {
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;

  const response = await fetch(pingUrl, {
    method: 'GET',
  });

  // Google returns 200 on success
  return { success: response.ok };
}
