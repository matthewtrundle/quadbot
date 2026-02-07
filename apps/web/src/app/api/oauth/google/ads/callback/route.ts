import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedCredentials } from '@quadbot/db';
import { encrypt } from '@quadbot/db';
import { getGoogleUserInfo } from '@/lib/google-api';
import { exchangeAdsCodeForTokens, listAdsAccounts } from '@/lib/google-ads-api';

/**
 * GET /api/oauth/google/ads/callback
 *
 * Handles OAuth callback for Google Ads:
 * 1. Exchanges code for tokens
 * 2. Fetches Ads accounts
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
    errorUrl.searchParams.set('service', 'ads');
    return NextResponse.redirect(errorUrl);
  }

  if (!code || state !== 'ads') {
    return NextResponse.json({ error: 'Invalid callback parameters' }, { status: 400 });
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeAdsCodeForTokens(code);

    // Get user info for naming the credential
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // List Ads accounts to verify the tokens work
    const accounts = await listAdsAccounts(tokens.access_token);

    // Encrypt and store the tokens
    const encrypted = encrypt(JSON.stringify(tokens));

    const [credential] = await db
      .insert(sharedCredentials)
      .values({
        type: 'google_ads',
        name: userInfo.email ? `${userInfo.email}'s Google Ads` : 'Google Ads',
        credentials_encrypted: encrypted,
        config: {
          email: userInfo.email,
          scopes: ['adwords', 'userinfo.email'],
          accounts_count: accounts.length,
          accounts: accounts.map(a => ({
            customerId: a.customerId,
            descriptiveName: a.descriptiveName,
          })),
        },
      })
      .returning();

    // Redirect to settings page with success
    const successUrl = new URL('/dashboard/settings', req.url);
    successUrl.searchParams.set('connected', 'ads');
    successUrl.searchParams.set('credentialId', credential.id);
    successUrl.searchParams.set('accountsCount', accounts.length.toString());

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('Google Ads OAuth callback error:', err);
    const errorUrl = new URL('/dashboard/settings', req.url);
    errorUrl.searchParams.set('error', err instanceof Error ? err.message : 'OAuth failed');
    errorUrl.searchParams.set('service', 'ads');
    return NextResponse.redirect(errorUrl);
  }
}
