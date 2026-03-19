import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brandIntegrations, sharedCredentials } from '@quadbot/db';
import { encrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { exchangeCodeForTokens, listGscSites, getGoogleUserInfo } from '@/lib/google-api';
import { cookies } from 'next/headers';

/**
 * GET /api/oauth/google/callback
 *
 * Handles OAuth callback for GSC connect flow:
 * 1. Validates CSRF state parameter
 * 2. Exchanges authorization code for real tokens
 * 3. Verifies tokens by fetching GSC sites
 * 4. Stores tokens in shared_credentials
 * 5. Updates or creates brand_integration linking to the credential
 * 6. Redirects back to brands page
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  // Parse and validate CSRF state
  let brandId: string | null = null;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
      const cookieStore = await cookies();
      const storedNonce = cookieStore.get('oauth_state_nonce')?.value;
      cookieStore.delete('oauth_state_nonce');

      if (!storedNonce || storedNonce !== parsed.nonce) {
        const errorUrl = new URL('/brands', req.url);
        errorUrl.searchParams.set('error', 'Invalid OAuth state — please try again');
        return NextResponse.redirect(errorUrl);
      }
      brandId = parsed.brandId || null;
    } catch {
      const errorUrl = new URL('/brands', req.url);
      errorUrl.searchParams.set('error', 'Invalid OAuth state');
      return NextResponse.redirect(errorUrl);
    }
  }

  if (error) {
    const errorUrl = new URL('/brands', req.url);
    errorUrl.searchParams.set('error', error);
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  try {
    // Exchange code for real tokens — redirect URI must match what was used in /connect
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    // Get user info for naming the credential
    const userInfo = await getGoogleUserInfo(tokens.access_token);

    // Verify tokens work by listing GSC sites
    const sites = await listGscSites(tokens.access_token);

    // Encrypt and store as shared credential
    const encrypted = encrypt(JSON.stringify(tokens));

    const [credential] = await db
      .insert(sharedCredentials)
      .values({
        type: 'google_search_console',
        name: userInfo.email ? `${userInfo.email} (GSC)` : 'Google Search Console',
        credentials_encrypted: encrypted,
        config: {
          email: userInfo.email,
          scopes: ['webmasters.readonly'],
          sites_count: sites.length,
        },
      })
      .returning();

    // If a brandId was passed in state, link the integration
    if (brandId) {
      // Check if brand already has a GSC integration
      const [existing] = await db
        .select()
        .from(brandIntegrations)
        .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'google_search_console')))
        .limit(1);

      if (existing) {
        // Update existing integration to use new credential
        await db
          .update(brandIntegrations)
          .set({
            shared_credential_id: credential.id,
            credentials_encrypted: null,
            updated_at: new Date(),
          })
          .where(eq(brandIntegrations.id, existing.id));
      } else {
        // Create new integration
        await db.insert(brandIntegrations).values({
          brand_id: brandId,
          type: 'google_search_console',
          shared_credential_id: credential.id,
          config: { scopes: ['webmasters.readonly'] },
        });
      }
    }

    const successUrl = new URL('/brands', req.url);
    successUrl.searchParams.set('connected', 'gsc');
    if (brandId) successUrl.searchParams.set('brandId', brandId);

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    const errorUrl = new URL('/brands', req.url);
    errorUrl.searchParams.set('error', err instanceof Error ? err.message : 'OAuth failed');
    return NextResponse.redirect(errorUrl);
  }
}
