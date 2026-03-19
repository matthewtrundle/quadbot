import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

/**
 * GET /api/oauth/google/connect?brandId=xxx
 *
 * Initiates OAuth flow to connect GSC for a specific brand.
 * Uses a CSRF nonce in the state parameter for security.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/callback`;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI (or NEXT_PUBLIC_APP_URL).' },
      { status: 501 },
    );
  }

  const brandId = req.nextUrl.searchParams.get('brandId') || '';

  // Generate CSRF nonce and encode brandId + nonce into state
  const nonce = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ brandId, nonce })).toString('base64url');

  // Store nonce in a short-lived cookie for callback verification
  const cookieStore = await cookies();
  cookieStore.set('oauth_state_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/api/oauth/google/callback',
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
