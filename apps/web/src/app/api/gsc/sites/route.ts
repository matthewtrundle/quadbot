import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedCredentials } from '@quadbot/db';
import { decrypt } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { listGscSites, refreshAccessToken, deriveBrandName, type GoogleTokens } from '@/lib/google-api';

/**
 * GET /api/gsc/sites?credentialId=xxx
 *
 * Lists all GSC sites accessible by a shared credential.
 * Refreshes the token if expired.
 */
export async function GET(req: NextRequest) {
  const credentialId = req.nextUrl.searchParams.get('credentialId');

  if (!credentialId) {
    return NextResponse.json({ error: 'credentialId is required' }, { status: 400 });
  }

  try {
    // Load the shared credential
    const [credential] = await db
      .select()
      .from(sharedCredentials)
      .where(eq(sharedCredentials.id, credentialId))
      .limit(1);

    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    // Decrypt tokens
    let tokens: GoogleTokens = JSON.parse(decrypt(credential.credentials_encrypted));

    // Check if token is expired
    const expiresAt = new Date(tokens.expires_at);
    if (expiresAt <= new Date()) {
      // Refresh the token
      tokens = await refreshAccessToken(tokens.refresh_token);

      // Update stored tokens
      const encrypted = (await import('@quadbot/db')).encrypt(JSON.stringify(tokens));
      await db
        .update(sharedCredentials)
        .set({
          credentials_encrypted: encrypted,
          updated_at: new Date(),
        })
        .where(eq(sharedCredentials.id, credentialId));
    }

    // List sites
    const sites = await listGscSites(tokens.access_token);

    // Enrich with suggested brand names
    const enrichedSites = sites.map((site) => ({
      ...site,
      suggestedBrandName: deriveBrandName(site.siteUrl),
    }));

    return NextResponse.json({
      credential: {
        id: credential.id,
        name: credential.name,
        config: credential.config,
      },
      sites: enrichedSites,
    });
  } catch (err) {
    console.error('Error listing GSC sites:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list sites' },
      { status: 500 },
    );
  }
}
