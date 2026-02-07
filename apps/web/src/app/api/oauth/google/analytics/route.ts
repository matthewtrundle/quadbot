import { NextResponse } from 'next/server';

/**
 * GET /api/oauth/google/analytics
 *
 * Initiates OAuth flow for Google Analytics (GA4) integration.
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_ANALYTICS_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/analytics/callback`;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID.' },
      { status: 501 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state: 'analytics',
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
