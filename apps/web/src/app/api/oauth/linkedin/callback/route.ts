/**
 * LinkedIn OAuth 2.0 Callback Route
 *
 * Exchanges the authorization code for access tokens,
 * fetches the user's profile URN, and stores encrypted
 * tokens in brand_integrations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brandIntegrations } from '@quadbot/db';
import { encrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const brandId = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const errorDescription = req.nextUrl.searchParams.get('error_description');

  if (error) {
    return NextResponse.json({ error: `LinkedIn OAuth error: ${error} — ${errorDescription || ''}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  if (!brandId) {
    return NextResponse.json({ error: 'Missing brand_id in state parameter' }, { status: 400 });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'LinkedIn OAuth not configured.' }, { status: 501 });
  }

  // Exchange authorization code for tokens
  const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    return NextResponse.json({ error: `Token exchange failed: ${errorBody}` }, { status: 502 });
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };

  // Fetch the user's LinkedIn profile to get the person URN
  let authorUrn = '';
  try {
    const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (profileResponse.ok) {
      const profile = (await profileResponse.json()) as { id: string };
      authorUrn = `urn:li:person:${profile.id}`;
    }
  } catch {
    // Non-fatal: the author_urn can be configured manually
  }

  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    author_urn: authorUrn || null,
  };

  const encrypted = encrypt(JSON.stringify(tokens));

  // Upsert: update existing or insert new integration
  const existing = await db
    .select({ id: brandIntegrations.id })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'linkedin')))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(brandIntegrations)
      .set({
        credentials_encrypted: encrypted,
        config: { scopes: ['w_member_social', 'r_liteprofile'], author_urn: authorUrn || null },
        updated_at: new Date(),
      })
      .where(eq(brandIntegrations.id, existing[0].id));
  } else {
    await db.insert(brandIntegrations).values({
      brand_id: brandId,
      type: 'linkedin',
      credentials_encrypted: encrypted,
      config: { scopes: ['w_member_social', 'r_liteprofile'], author_urn: authorUrn || null },
    });
  }

  return NextResponse.redirect(new URL('/brands', req.url));
}
