/**
 * LinkedIn OAuth 2.0 Authorization Route
 *
 * Redirects to LinkedIn's OAuth 2.0 authorization endpoint.
 * Scopes: w_member_social r_liteprofile
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'LinkedIn OAuth not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI.' },
      { status: 501 },
    );
  }

  const brandId = req.nextUrl.searchParams.get('brand_id') || '';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'w_member_social r_liteprofile',
    state: brandId,
  });

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
