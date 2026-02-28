/**
 * Twitter/X OAuth 2.0 Authorization Route
 *
 * Redirects to Twitter's OAuth 2.0 authorization endpoint using PKCE.
 * Scopes: tweet.write tweet.read users.read offline.access
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Generate a cryptographically random code verifier for PKCE.
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a code challenge from a code verifier using S256.
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export async function GET(req: NextRequest) {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const redirectUri = process.env.TWITTER_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Twitter OAuth not configured. Set TWITTER_CLIENT_ID and TWITTER_REDIRECT_URI.' },
      { status: 501 },
    );
  }

  const brandId = req.nextUrl.searchParams.get('brand_id') || '';

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.write tweet.read users.read offline.access',
    state: brandId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

  // Store code_verifier in a cookie for the callback to use
  const response = NextResponse.redirect(authUrl);
  response.cookies.set('twitter_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/api/oauth/twitter',
  });

  return response;
}
