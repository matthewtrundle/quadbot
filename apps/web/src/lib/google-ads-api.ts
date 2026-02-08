/**
 * Google Ads API helper functions
 *
 * Note: Google Ads API requires additional setup:
 * - Developer token from Google Ads API Center
 * - OAuth with `https://www.googleapis.com/auth/adwords` scope
 * - Manager account or customer ID
 */

export type GoogleAdsTokens = {
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
  cost_per_conversion: number;
};

export type AdsAccountSummary = {
  customerId: string;
  descriptiveName: string;
  campaigns: AdsCampaign[];
};

const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

/**
 * Get OAuth URL for Google Ads authorization
 */
export function getAdsAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/ads/callback`;

  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID must be configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `${GOOGLE_ADS_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens (Google Ads)
 */
export async function exchangeAdsCodeForTokens(code: string): Promise<GoogleAdsTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/ads/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * List accessible Google Ads accounts
 *
 * In production, this would use the Google Ads API:
 * GET https://googleads.googleapis.com/v21/customers:listAccessibleCustomers
 */
export async function listAdsAccounts(accessToken: string): Promise<AdsAccountSummary[]> {
  // Google Ads API requires additional headers:
  // - developer-token: Your Google Ads API developer token
  // - login-customer-id: Manager account ID (if using manager account)

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is required to access Google Ads API');
  }

  const response = await fetch(
    'https://googleads.googleapis.com/v21/customers:listAccessibleCustomers',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list Ads accounts: ${error}`);
  }

  const data = await response.json();
  return data.resourceNames?.map((name: string) => ({
    customerId: name.replace('customers/', ''),
    descriptiveName: name,
    campaigns: [],
  })) || [];
}

/**
 * Get campaign performance data
 *
 * In production, this would use Google Ads Query Language (GAQL)
 */
export async function getCampaignPerformance(
  accessToken: string,
  customerId: string,
  dateRange: { start: string; end: string },
): Promise<AdsCampaign[]> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!developerToken) {
    throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is required to access Google Ads API');
  }

  // GAQL query for campaign performance
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
  `;

  const response = await fetch(
    `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:searchStream`,
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
    throw new Error(`Failed to get campaign performance: ${error}`);
  }

  const data = await response.json();

  return data.results?.map((row: any) => ({
    id: row.campaign.id,
    name: row.campaign.name,
    status: row.campaign.status,
    spend: (row.metrics.costMicros || 0) / 1_000_000,
    impressions: row.metrics.impressions || 0,
    clicks: row.metrics.clicks || 0,
    conversions: row.metrics.conversions || 0,
    cost_per_conversion: row.metrics.conversions > 0
      ? (row.metrics.costMicros / 1_000_000) / row.metrics.conversions
      : 0,
  })) || [];
}
