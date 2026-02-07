/**
 * Google API helper functions for OAuth and GSC operations
 */

export type GoogleTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type GscSite = {
  siteUrl: string;
  permissionLevel: 'siteOwner' | 'siteFullUser' | 'siteRestrictedUser' | 'siteUnverifiedUser';
};

export type GscSitesResponse = {
  siteEntry?: GscSite[];
};

/**
 * Exchange authorization code for OAuth tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_IMPORT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/import/callback`;

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
 * List all GSC sites accessible by the given access token
 */
export async function listGscSites(accessToken: string): Promise<GscSite[]> {
  const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list GSC sites: ${error}`);
  }

  const data: GscSitesResponse = await response.json();
  return data.siteEntry || [];
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
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

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: refreshToken, // Refresh token doesn't change
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Get user info from Google to display account name
 */
export async function getGoogleUserInfo(accessToken: string): Promise<{ email: string; name?: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user info: ${error}`);
  }

  return response.json();
}

/**
 * Derive a brand name from a GSC site URL
 */
export function deriveBrandName(siteUrl: string): string {
  try {
    // Handle both URL properties (https://example.com/) and domain properties (sc-domain:example.com)
    if (siteUrl.startsWith('sc-domain:')) {
      return siteUrl.replace('sc-domain:', '');
    }
    const url = new URL(siteUrl);
    // Remove www. prefix and return hostname
    return url.hostname.replace(/^www\./, '');
  } catch {
    return siteUrl;
  }
}
