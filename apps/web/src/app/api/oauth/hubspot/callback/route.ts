import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brandIntegrations } from '@quadbot/db';
import { encrypt } from '@quadbot/db';

/**
 * HubSpot OAuth callback route.
 * Exchanges the authorization code for access and refresh tokens,
 * encrypts them, and stores them in brand_integrations.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const brandId = req.nextUrl.searchParams.get('state');

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  if (!brandId) {
    return NextResponse.json({ error: 'Missing brand ID in state parameter' }, { status: 400 });
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error: 'HubSpot OAuth not configured. Set HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, and HUBSPOT_REDIRECT_URI.',
      },
      { status: 501 },
    );
  }

  // Exchange the authorization code for tokens
  const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('HubSpot token exchange failed:', errorText);
    return NextResponse.json({ error: 'Failed to exchange authorization code for tokens' }, { status: 502 });
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
  };

  const encrypted = encrypt(JSON.stringify(tokens));

  await db.insert(brandIntegrations).values({
    brand_id: brandId,
    type: 'hubspot',
    credentials_encrypted: encrypted,
    config: {
      scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
    },
  });

  // Redirect to brand settings page
  const settingsUrl = new URL('/brands/' + brandId + '/settings', req.url);
  return NextResponse.redirect(settingsUrl);
}
