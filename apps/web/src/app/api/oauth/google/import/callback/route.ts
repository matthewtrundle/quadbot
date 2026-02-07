import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedCredentials } from '@quadbot/db';
import { encrypt } from '@quadbot/db';
import {
  exchangeCodeForTokens,
  listGscSites,
  getGoogleUserInfo,
} from '@/lib/google-api';
import { listGA4Properties } from '@/lib/google-analytics-api';
import { listAdsAccounts } from '@/lib/google-ads-api';

/**
 * GET /api/oauth/google/import/callback
 *
 * Handles OAuth callback for multi-service import:
 * 1. Exchanges code for tokens
 * 2. Fetches data from each selected integration
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

  // State format: "import:gsc,ads,analytics"
  if (!code || !state?.startsWith('import')) {
    return NextResponse.json({ error: 'Invalid callback parameters' }, { status: 400 });
  }

  // Parse integrations from state
  const integrations = state.includes(':')
    ? state.split(':')[1].split(',')
    : ['gsc'];

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user info for naming the credential
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // Fetch data from each selected integration
    const config: Record<string, unknown> = {
      email: userInfo.email,
      integrations,
    };

    // GSC
    if (integrations.includes('gsc')) {
      try {
        const sites = await listGscSites(tokens.access_token);
        config.gsc_sites_count = sites.length;
        config.gsc_enabled = true;
      } catch (err) {
        console.error('Failed to fetch GSC sites:', err);
        config.gsc_enabled = false;
        config.gsc_error = err instanceof Error ? err.message : 'Failed to fetch';
      }
    }

    // Google Analytics
    if (integrations.includes('analytics')) {
      try {
        const properties = await listGA4Properties(tokens.access_token);
        config.ga4_properties_count = properties.length;
        config.ga4_enabled = true;
        config.ga4_properties = properties.map(p => ({
          name: p.name,
          displayName: p.displayName,
        }));
      } catch (err) {
        console.error('Failed to fetch GA4 properties:', err);
        config.ga4_enabled = false;
        config.ga4_error = err instanceof Error ? err.message : 'Failed to fetch';
      }
    }

    // Google Ads
    if (integrations.includes('ads')) {
      try {
        const accounts = await listAdsAccounts(tokens.access_token);
        config.ads_accounts_count = accounts.length;
        config.ads_enabled = true;
        config.ads_accounts = accounts.map(a => ({
          customerId: a.customerId,
          descriptiveName: a.descriptiveName,
        }));
      } catch (err) {
        console.error('Failed to fetch Ads accounts:', err);
        config.ads_enabled = false;
        config.ads_error = err instanceof Error ? err.message : 'Failed to fetch';
      }
    }

    // Encrypt and store the tokens
    const encrypted = encrypt(JSON.stringify(tokens));

    // Build a descriptive name based on connected services
    const serviceNames = [];
    if (config.gsc_enabled) serviceNames.push('GSC');
    if (config.ga4_enabled) serviceNames.push('GA4');
    if (config.ads_enabled) serviceNames.push('Ads');
    const servicesLabel = serviceNames.length > 0 ? ` (${serviceNames.join(', ')})` : '';

    const [credential] = await db
      .insert(sharedCredentials)
      .values({
        type: 'google_oauth',
        name: userInfo.email
          ? `${userInfo.email}${servicesLabel}`
          : `Google Account${servicesLabel}`,
        credentials_encrypted: encrypted,
        config,
      })
      .returning();

    // Redirect to import page with the credential ID
    const successUrl = new URL('/onboarding/gsc-import', req.url);
    successUrl.searchParams.set('credentialId', credential.id);
    successUrl.searchParams.set('integrations', integrations.join(','));

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('OAuth callback error:', err);
    const errorUrl = new URL('/onboarding/gsc-import', req.url);
    errorUrl.searchParams.set('error', err instanceof Error ? err.message : 'OAuth failed');
    return NextResponse.redirect(errorUrl);
  }
}
