import { NextRequest, NextResponse } from 'next/server';

/**
 * HubSpot OAuth initiation route.
 * Redirects the user to HubSpot's OAuth consent screen.
 *
 * Expects:
 *   - HUBSPOT_CLIENT_ID env var
 *   - HUBSPOT_REDIRECT_URI env var
 *   - ?brandId= query param for state tracking
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'HubSpot OAuth not configured. Set HUBSPOT_CLIENT_ID and HUBSPOT_REDIRECT_URI.' },
      { status: 501 },
    );
  }

  const brandId = req.nextUrl.searchParams.get('brandId') || '';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'crm.objects.contacts.read crm.objects.contacts.write',
    state: brandId,
  });

  const authorizeUrl = 'https://app.hubspot.com/oauth/authorize?' + params.toString();

  return NextResponse.redirect(authorizeUrl);
}
