/**
 * Google Analytics 4 API helper functions
 *
 * Uses the Google Analytics Data API (GA4)
 * Requires OAuth with `https://www.googleapis.com/auth/analytics.readonly` scope
 */

export type GA4Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type GA4Property = {
  name: string;
  displayName: string;
  propertyType: string;
  createTime: string;
};

export type GA4Metrics = {
  sessions: number;
  users: number;
  newUsers: number;
  bounceRate: number;
  avgSessionDuration: number;
  screenPageViews: number;
  conversions: number;
};

export type GA4PageReport = {
  pagePath: string;
  pageTitle: string;
  pageviews: number;
  avgTimeOnPage: number;
  exitRate: number;
  bounceRate: number;
};

const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

/**
 * Get OAuth URL for Google Analytics authorization
 */
export function getAnalyticsAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_ANALYTICS_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/analytics/callback`;

  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID must be configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: `${ANALYTICS_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens (GA4)
 */
export async function exchangeAnalyticsCodeForTokens(code: string): Promise<GA4Tokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_ANALYTICS_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/analytics/callback`;

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
 * List accessible GA4 properties
 */
export async function listGA4Properties(accessToken: string): Promise<GA4Property[]> {
  const response = await fetch(
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list GA4 properties: ${error}`);
  }

  const data = await response.json();

  // Flatten account summaries to get all properties
  const properties: GA4Property[] = [];
  for (const account of data.accountSummaries || []) {
    for (const prop of account.propertySummaries || []) {
      properties.push({
        name: prop.property,
        displayName: prop.displayName,
        propertyType: prop.propertyType || 'PROPERTY_TYPE_ORDINARY',
        createTime: prop.createTime || '',
      });
    }
  }

  return properties;
}

/**
 * Get core metrics for a GA4 property
 */
export async function getGA4Metrics(
  accessToken: string,
  propertyId: string,
  dateRange: { start: string; end: string },
): Promise<GA4Metrics> {
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
          { name: 'screenPageViews' },
          { name: 'conversions' },
        ],
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch GA4 metrics: ${error}`);
  }

  const data = await response.json();
  const row = data.rows?.[0]?.metricValues || [];

  return {
    sessions: parseInt(row[0]?.value || '0'),
    users: parseInt(row[1]?.value || '0'),
    newUsers: parseInt(row[2]?.value || '0'),
    bounceRate: parseFloat(row[3]?.value || '0'),
    avgSessionDuration: parseFloat(row[4]?.value || '0'),
    screenPageViews: parseInt(row[5]?.value || '0'),
    conversions: parseInt(row[6]?.value || '0'),
  };
}

/**
 * Get top pages report for a GA4 property
 */
export async function getGA4TopPages(
  accessToken: string,
  propertyId: string,
  dateRange: { start: string; end: string },
  limit: number = 20,
): Promise<GA4PageReport[]> {
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
        dimensions: [
          { name: 'pagePath' },
          { name: 'pageTitle' },
        ],
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
    throw new Error(`Failed to fetch GA4 top pages: ${error}`);
  }

  const data = await response.json();

  return (data.rows || []).map((row: any) => ({
    pagePath: row.dimensionValues[0].value,
    pageTitle: row.dimensionValues[1].value,
    pageviews: parseInt(row.metricValues[0].value),
    avgTimeOnPage: parseFloat(row.metricValues[1].value),
    exitRate: 0, // Not directly available, would need separate query
    bounceRate: parseFloat(row.metricValues[2].value),
  }));
}
