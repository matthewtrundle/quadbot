import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brandIntegrations } from '@quadbot/db';
import { encrypt } from '@quadbot/db';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const brandId = req.nextUrl.searchParams.get('state');

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  // In production, exchange code for tokens via Google's token endpoint
  // For v1, we stub this and store a placeholder
  const stubTokens = {
    access_token: 'stub_access_token',
    refresh_token: 'stub_refresh_token',
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  };

  const encrypted = encrypt(JSON.stringify(stubTokens));

  if (brandId) {
    await db.insert(brandIntegrations).values({
      brand_id: brandId,
      type: 'google_search_console',
      credentials_encrypted: encrypted,
      config: { scopes: ['webmasters.readonly'] },
    });
  }

  return NextResponse.redirect(new URL('/brands', req.url));
}
