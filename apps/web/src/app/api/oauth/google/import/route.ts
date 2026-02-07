import { NextResponse } from 'next/server';

/**
 * GET /api/oauth/google/import
 *
 * Initiates OAuth flow for GSC import (not brand-specific).
 * Uses state=import to distinguish from brand-specific OAuth.
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_IMPORT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/import/callback`;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_IMPORT_REDIRECT_URI.' },
      { status: 501 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state: 'import', // Indicates this is for bulk import, not brand-specific
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
