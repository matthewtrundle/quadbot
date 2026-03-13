import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/oauth/google/connect?brandId=xxx
 *
 * Initiates OAuth flow to connect GSC for a specific brand.
 * Passes brandId in the state parameter so the callback can link the integration.
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

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state: brandId,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
