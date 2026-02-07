import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedCredentials } from '@quadbot/db';
import { encrypt } from '@quadbot/db';
import { getGoogleUserInfo } from '@/lib/google-api';
import { exchangeAnalyticsCodeForTokens, listGA4Properties } from '@/lib/google-analytics-api';

/**
 * GET /api/oauth/google/analytics/callback
 *
 * Handles OAuth callback for Google Analytics (GA4):
 * 1. Exchanges code for tokens
 * 2. Fetches GA4 properties
 * 3. Gets user info for naming
 * 4. Stores tokens in shared_credentials
 * 5. Redirects to settings page with success
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    const errorUrl = new URL('/dashboard/settings', req.url);
    errorUrl.searchParams.set('error', error);
    errorUrl.searchParams.set('service', 'analytics');
    return NextResponse.redirect(errorUrl);
  }

  if (!code || state !== 'analytics') {
    return NextResponse.json({ error: 'Invalid callback parameters' }, { status: 400 });
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeAnalyticsCodeForTokens(code);

    // Get user info for naming the credential
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // List GA4 properties to verify the tokens work
    const properties = await listGA4Properties(tokens.access_token);

    // Encrypt and store the tokens
    const encrypted = encrypt(JSON.stringify(tokens));

    const [credential] = await db
      .insert(sharedCredentials)
      .values({
        type: 'google_analytics',
        name: userInfo.email ? `${userInfo.email}'s GA4` : 'Google Analytics',
        credentials_encrypted: encrypted,
        config: {
          email: userInfo.email,
          scopes: ['analytics.readonly', 'userinfo.email'],
          properties_count: properties.length,
          properties: properties.map(p => ({
            name: p.name,
            displayName: p.displayName,
          })),
        },
      })
      .returning();

    // Redirect to settings page with success
    const successUrl = new URL('/dashboard/settings', req.url);
    successUrl.searchParams.set('connected', 'analytics');
    successUrl.searchParams.set('credentialId', credential.id);
    successUrl.searchParams.set('propertiesCount', properties.length.toString());

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('GA4 OAuth callback error:', err);
    const errorUrl = new URL('/dashboard/settings', req.url);
    errorUrl.searchParams.set('error', err instanceof Error ? err.message : 'OAuth failed');
    errorUrl.searchParams.set('service', 'analytics');
    return NextResponse.redirect(errorUrl);
  }
}
