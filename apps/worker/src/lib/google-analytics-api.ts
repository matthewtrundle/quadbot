/**
 * Google Analytics 4 API utilities for the worker
 *
 * Uses the Google Analytics Data API (GA4)
 * Requires:
 * - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for OAuth token refresh
 */

import { brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { IntegrationType } from '@quadbot/shared';
import { logger } from '../logger.js';

export type Ga4Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type Ga4Metrics = {
  sessions: number;
  users: number;
  new_users: number;
  bounce_rate: number;
  avg_session_duration: number;
  pages_per_session: number;
  conversions: Record<string, number>;
};

export type Ga4PageData = {
  path: string;
  views: number;
  avg_time: number;
  bounce_rate: number;
};

export type Ga4TrafficSource = {
  source: string;
  sessions: number;
  users: number;
  conversions: number;
};

export type Ga4AnalyticsData = {
  period: string;
  sessions: number;
  users: number;
  new_users: number;
  bounce_rate: number;
  avg_session_duration: number;
  pages_per_session: number;
  conversions: Record<string, number>;
  top_pages: Ga4PageData[];
  traffic_sources: Record<string, number>;
  device_breakdown: Record<string, number>;
};

/**
 * Load Google Analytics credentials for a brand integration.
 * Supports both direct credentials and shared credentials.
 */
export async function loadGa4Credentials(
  db: Database,
  brandId: string,
): Promise<{ tokens: Ga4Tokens; propertyId: string } | null> {
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, IntegrationType.GOOGLE_ANALYTICS),
      ),
    )
    .limit(1);

  if (!integration) {
    return null;
  }

  // Get property ID from integration config
  const config = integration.config as { property_id?: string } | null;
  const propertyId = config?.property_id;

  if (!propertyId) {
    logger.warn({ brandId }, 'Google Analytics integration missing property_id in config');
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
      const tokens = JSON.parse(decrypt(shared.credentials_encrypted)) as Ga4Tokens;
      return { tokens, propertyId };
    }
  }

  // Fall back to direct credentials
  if (integration.credentials_encrypted) {
    const tokens = JSON.parse(decrypt(integration.credentials_encrypted)) as Ga4Tokens;
    return { tokens, propertyId };
  }

  return null;
}

/**
 * Refresh an expired access token using the refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<Ga4Tokens> {
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
 * Check if tokens are expired and refresh if needed.
 * Returns fresh tokens with valid access_token.
 */
export async function refreshGa4TokenIfNeeded(tokens: Ga4Tokens): Promise<Ga4Tokens> {
  // Check if token is expired (with 5 minute buffer)
  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > now.getTime()) {
    return tokens;
  }

  // Token expired, refresh it
  logger.info('Refreshing expired Google Analytics access token');
  return refreshAccessToken(tokens.refresh_token);
}

/**
 * Get core metrics from GA4 Data API
 */
export async function getGa4Metrics(
  accessToken: string,
  propertyId: string,
  dateRange: { start: string; end: string },
): Promise<Ga4Metrics | null> {
  try {
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'screenPageViewsPerSession' },
            { name: 'conversions' },
          ],
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, propertyId }, 'GA4 metrics request failed');
      return null;
    }

    const data = await response.json() as any;
    const row = data.rows?.[0]?.metricValues || [];

    return {
      sessions: parseInt(row[0]?.value || '0'),
      users: parseInt(row[1]?.value || '0'),
      new_users: parseInt(row[2]?.value || '0'),
      bounce_rate: parseFloat(row[3]?.value || '0'),
      avg_session_duration: parseFloat(row[4]?.value || '0'),
      pages_per_session: parseFloat(row[5]?.value || '0'),
      conversions: { total: parseInt(row[6]?.value || '0') },
    };
  } catch (error) {
    logger.error({ error, propertyId }, 'Failed to fetch GA4 metrics');
    return null;
  }
}

/**
 * Get top pages report from GA4 Data API
 */
export async function getGa4TopPages(
  accessToken: string,
  propertyId: string,
  dateRange: { start: string; end: string },
  limit: number = 10,
): Promise<Ga4PageData[] | null> {
  try {
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
          ],
          orderBys: [
            { metric: { metricName: 'screenPageViews' }, desc: true },
          ],
          limit,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, propertyId }, 'GA4 top pages request failed');
      return null;
    }

    const data = await response.json() as any;

    return (data.rows || []).map((row: any) => ({
      path: row.dimensionValues[0].value,
      views: parseInt(row.metricValues[0].value),
      avg_time: parseFloat(row.metricValues[1].value),
      bounce_rate: parseFloat(row.metricValues[2].value),
    }));
  } catch (error) {
    logger.error({ error, propertyId }, 'Failed to fetch GA4 top pages');
    return null;
  }
}

/**
 * Get traffic sources breakdown from GA4 Data API
 */
export async function getGa4TrafficSources(
  accessToken: string,
  propertyId: string,
  dateRange: { start: string; end: string },
): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [
            { metric: { metricName: 'sessions' }, desc: true },
          ],
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, propertyId }, 'GA4 traffic sources request failed');
      return null;
    }

    const data = await response.json() as any;

    const sources: Record<string, number> = {};
    for (const row of data.rows || []) {
      const channel = row.dimensionValues[0].value.toLowerCase().replace(/\s+/g, '_');
      sources[channel] = parseInt(row.metricValues[0].value);
    }

    return sources;
  } catch (error) {
    logger.error({ error, propertyId }, 'Failed to fetch GA4 traffic sources');
    return null;
  }
}

/**
 * Get device breakdown from GA4 Data API
 */
export async function getGa4DeviceBreakdown(
  accessToken: string,
  propertyId: string,
  dateRange: { start: string; end: string },
): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
          dimensions: [{ name: 'deviceCategory' }],
          metrics: [{ name: 'sessions' }],
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, propertyId }, 'GA4 device breakdown request failed');
      return null;
    }

    const data = await response.json() as any;

    // Calculate percentages
    let totalSessions = 0;
    const deviceCounts: Record<string, number> = {};

    for (const row of data.rows || []) {
      const device = row.dimensionValues[0].value.toLowerCase();
      const sessions = parseInt(row.metricValues[0].value);
      deviceCounts[device] = sessions;
      totalSessions += sessions;
    }

    // Convert to percentages
    const breakdown: Record<string, number> = {};
    for (const [device, count] of Object.entries(deviceCounts)) {
      breakdown[device] = totalSessions > 0 ? count / totalSessions : 0;
    }

    return breakdown;
  } catch (error) {
    logger.error({ error, propertyId }, 'Failed to fetch GA4 device breakdown');
    return null;
  }
}

/**
 * Get comprehensive analytics data by combining multiple API calls.
 * Returns null if any critical API call fails.
 */
export async function getGa4AnalyticsData(
  accessToken: string,
  propertyId: string,
  dateRange: { start: string; end: string },
): Promise<Ga4AnalyticsData | null> {
  // Fetch all data in parallel
  const [metrics, topPages, trafficSources, deviceBreakdown] = await Promise.all([
    getGa4Metrics(accessToken, propertyId, dateRange),
    getGa4TopPages(accessToken, propertyId, dateRange),
    getGa4TrafficSources(accessToken, propertyId, dateRange),
    getGa4DeviceBreakdown(accessToken, propertyId, dateRange),
  ]);

  // If core metrics failed, return null
  if (!metrics) {
    return null;
  }

  return {
    period: `${dateRange.start} to ${dateRange.end}`,
    sessions: metrics.sessions,
    users: metrics.users,
    new_users: metrics.new_users,
    bounce_rate: metrics.bounce_rate,
    avg_session_duration: metrics.avg_session_duration,
    pages_per_session: metrics.pages_per_session,
    conversions: metrics.conversions,
    top_pages: topPages || [],
    traffic_sources: trafficSources || {},
    device_breakdown: deviceBreakdown || {},
  };
}

/**
 * Get a valid access token, refreshing if needed
 */
export async function getValidGa4AccessToken(
  db: Database,
  brandId: string,
): Promise<{ accessToken: string; propertyId: string } | null> {
  const credentials = await loadGa4Credentials(db, brandId);
  if (!credentials) {
    return null;
  }

  try {
    const freshTokens = await refreshGa4TokenIfNeeded(credentials.tokens);

    // Persist refreshed tokens if they changed
    if (freshTokens.access_token !== credentials.tokens.access_token) {
      const { persistRefreshedTokens } = await import('./token-persistence.js');
      await persistRefreshedTokens(db, brandId, IntegrationType.GOOGLE_ANALYTICS, freshTokens);
    }

    return {
      accessToken: freshTokens.access_token,
      propertyId: credentials.propertyId,
    };
  } catch (error) {
    logger.error({ brandId, error }, 'Failed to refresh Google Analytics access token');
    return null;
  }
}
