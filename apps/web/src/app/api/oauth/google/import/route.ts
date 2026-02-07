import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/oauth/google/import
 *
 * Initiates OAuth flow for multi-service import.
 * Accepts optional scopes and integrations query params for dynamic scope selection.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_IMPORT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/import/callback`;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_IMPORT_REDIRECT_URI.' },
      { status: 501 },
    );
  }

  // Get custom scopes from query params, or use default GSC scopes
  const customScopes = req.nextUrl.searchParams.get('scopes');
  const integrations = req.nextUrl.searchParams.get('integrations') || 'gsc';

  const defaultScopes = 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email';
  const scopes = customScopes || defaultScopes;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state: `import:${integrations}`, // Pass integrations in state for callback to process
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
