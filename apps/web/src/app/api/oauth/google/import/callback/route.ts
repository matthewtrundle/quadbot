import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedCredentials } from '@quadbot/db';
import { encrypt } from '@quadbot/db';
import {
  exchangeCodeForTokens,
  listGscSites,
  getGoogleUserInfo,
} from '@/lib/google-api';

/**
 * GET /api/oauth/google/import/callback
 *
 * Handles OAuth callback for GSC import:
 * 1. Exchanges code for tokens
 * 2. Fetches GSC sites
 * 3. Gets user info for naming
 * 4. Stores tokens in shared_credentials
 * 5. Redirects to import page with credential ID
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    const errorUrl = new URL('/onboarding/gsc-import', req.url);
    errorUrl.searchParams.set('error', error);
    return NextResponse.redirect(errorUrl);
  }

  if (!code || state !== 'import') {
    return NextResponse.json({ error: 'Invalid callback parameters' }, { status: 400 });
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user info for naming the credential
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // List GSC sites to verify the tokens work
    const sites = await listGscSites(tokens.access_token);

    // Encrypt and store the tokens
    const encrypted = encrypt(JSON.stringify(tokens));

    const [credential] = await db
      .insert(sharedCredentials)
      .values({
        type: 'google_oauth',
        name: userInfo.email ? `${userInfo.email}'s Google Account` : 'Google Account',
        credentials_encrypted: encrypted,
        config: {
          email: userInfo.email,
          scopes: ['webmasters.readonly', 'userinfo.email'],
          sites_count: sites.length,
        },
      })
      .returning();

    // Redirect to import page with the credential ID and sites in session storage via client redirect
    const successUrl = new URL('/onboarding/gsc-import', req.url);
    successUrl.searchParams.set('credentialId', credential.id);
    successUrl.searchParams.set('sitesCount', sites.length.toString());

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const errorUrl = new URL('/onboarding/gsc-import', req.url);
    errorUrl.searchParams.set('error', err instanceof Error ? err.message : 'OAuth failed');
    return NextResponse.redirect(errorUrl);
  }
}
