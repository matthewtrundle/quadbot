/**
 * Google Ads API utilities for the worker
 *
 * Requires:
 * - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for OAuth token refresh
 * - GOOGLE_ADS_DEVELOPER_TOKEN for API access (production only)
 */

import { brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { IntegrationType } from '@quadbot/shared';
import { logger } from '../logger.js';

export type AdsTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type AdsCampaign = {
  id: string;
  name: string;
  status: 'ENABLED' | 'PAUSED' | 'REMOVED';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
};

export type AdsPerformanceData = {
  period: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  avg_cpc: number;
  avg_roas: number;
  campaigns: AdsCampaign[];
};

/**
 * Load Google Ads credentials for a brand integration.
 * Supports both direct credentials and shared credentials.
 */
export async function loadAdsCredentials(
  db: Database,
  brandId: string,
): Promise<{ tokens: AdsTokens; customerId: string } | null> {
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, IntegrationType.GOOGLE_ADS),
      ),
    )
    .limit(1);

  if (!integration) {
    return null;
  }

  // Get customer ID from integration config
  const config = integration.config as { customer_id?: string } | null;
  const customerId = config?.customer_id;

  if (!customerId) {
    logger.warn({ brandId }, 'Google Ads integration missing customer_id in config');
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
      const tokens = JSON.parse(decrypt(shared.credentials_encrypted)) as AdsTokens;
      return { tokens, customerId };
    }
  }

  // Fall back to direct credentials
  if (integration.credentials_encrypted) {
    const tokens = JSON.parse(decrypt(integration.credentials_encrypted)) as AdsTokens;
    return { tokens, customerId };
  }

  return null;
}

/**
 * Refresh an expired access token using the refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<AdsTokens> {
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
export async function refreshAdsTokenIfNeeded(tokens: AdsTokens): Promise<AdsTokens> {
  // Check if token is expired (with 5 minute buffer)
  const expiresAt = new Date(tokens.expires_at);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > now.getTime()) {
    return tokens;
  }

  // Token expired, refresh it
  logger.info('Refreshing expired Google Ads access token');
  return refreshAccessToken(tokens.refresh_token);
}

/**
 * Get campaign performance data from Google Ads API.
 * Falls back to null if developer token is not configured.
 */
export async function getAdsPerformance(
  accessToken: string,
  customerId: string,
  dateRange: { start: string; end: string },
): Promise<AdsPerformanceData | null> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    logger.warn('GOOGLE_ADS_DEVELOPER_TOKEN not configured, cannot call Google Ads API');
    return null;
  }

  // Remove dashes from customer ID if present
  const cleanCustomerId = customerId.replace(/-/g, '');

  // GAQL query for campaign performance
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
      AND campaign.status != 'REMOVED'
  `;

  try {
    const response = await fetch(
      `https://googleads.googleapis.com/v18/customers/${cleanCustomerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, customerId }, 'Google Ads API request failed');
      return null;
    }

    const data = await response.json() as any;

    // Parse the streaming response - it comes as array of result batches
    const campaigns: AdsCampaign[] = [];
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalConversionsValue = 0;

    // Handle streaming response format
    const results = Array.isArray(data) ? data.flatMap((batch: any) => batch.results || []) : data.results || [];

    for (const row of results) {
      const spend = (row.metrics?.costMicros || 0) / 1_000_000;
      const impressions = row.metrics?.impressions || 0;
      const clicks = row.metrics?.clicks || 0;
      const conversions = row.metrics?.conversions || 0;
      const conversionsValue = row.metrics?.conversionsValue || 0;

      totalSpend += spend;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalConversions += conversions;
      totalConversionsValue += conversionsValue;

      campaigns.push({
        id: row.campaign?.id || '',
        name: row.campaign?.name || '',
        status: row.campaign?.status || 'ENABLED',
        spend,
        impressions,
        clicks,
        conversions,
        roas: spend > 0 ? conversionsValue / spend : 0,
      });
    }

    return {
      period: `${dateRange.start} to ${dateRange.end}`,
      total_spend: totalSpend,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      total_conversions: totalConversions,
      avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avg_roas: totalSpend > 0 ? totalConversionsValue / totalSpend : 0,
      campaigns,
    };
  } catch (error) {
    logger.error({ error, customerId }, 'Failed to fetch Google Ads performance data');
    return null;
  }
}

/**
 * Get a valid access token, refreshing and persisting if needed
 */
export async function getValidAdsAccessToken(
  db: Database,
  brandId: string,
): Promise<{ accessToken: string; customerId: string } | null> {
  const credentials = await loadAdsCredentials(db, brandId);
  if (!credentials) {
    return null;
  }

  try {
    const freshTokens = await refreshAdsTokenIfNeeded(credentials.tokens);

    // Persist refreshed tokens if they changed
    if (freshTokens.access_token !== credentials.tokens.access_token) {
      const { persistRefreshedTokens } = await import('./token-persistence.js');
      await persistRefreshedTokens(db, brandId, IntegrationType.GOOGLE_ADS, freshTokens);
    }

    return {
      accessToken: freshTokens.access_token,
      customerId: credentials.customerId,
    };
  } catch (error) {
    logger.error({ brandId, error }, 'Failed to refresh Google Ads access token');
    return null;
  }
}
