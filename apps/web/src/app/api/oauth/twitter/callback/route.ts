/**
 * Twitter/X OAuth 2.0 Callback Route
 *
 * Exchanges the authorization code for access and refresh tokens,
 * then stores them encrypted in brand_integrations.
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

  if (error) {
    return NextResponse.json({ error: `Twitter OAuth error: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  if (!brandId) {
    return NextResponse.json({ error: 'Missing brand_id in state parameter' }, { status: 400 });
  }

  // Retrieve the code_verifier from cookie (set during authorization redirect)
  const codeVerifier = req.cookies.get('twitter_code_verifier')?.value;
  if (!codeVerifier) {
    return NextResponse.json(
      { error: 'Missing PKCE code_verifier cookie. Please restart the OAuth flow.' },
      { status: 400 },
    );
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const redirectUri = process.env.TWITTER_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Twitter OAuth not configured.' }, { status: 501 });
  }

  // Exchange authorization code for tokens
  const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    return NextResponse.json({ error: `Token exchange failed: ${errorBody}` }, { status: 502 });
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  };

  const encrypted = encrypt(JSON.stringify(tokens));

  // Upsert: update existing or insert new integration
  const existing = await db
    .select({ id: brandIntegrations.id })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'twitter')))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(brandIntegrations)
      .set({
        credentials_encrypted: encrypted,
        updated_at: new Date(),
      })
      .where(eq(brandIntegrations.id, existing[0].id));
  } else {
    await db.insert(brandIntegrations).values({
      brand_id: brandId,
      type: 'twitter',
      credentials_encrypted: encrypted,
      config: { scopes: ['tweet.write', 'tweet.read', 'users.read', 'offline.access'] },
    });
  }

  // Clear the PKCE cookie
  const response = NextResponse.redirect(new URL('/brands', req.url));
  response.cookies.set('twitter_code_verifier', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/oauth/twitter',
  });

  return response;
}
