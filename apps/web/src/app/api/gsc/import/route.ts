import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brands, brandIntegrations, sharedCredentials } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const importSchema = z.object({
  sharedCredentialId: z.string().uuid(),
  sites: z.array(
    z.object({
      siteUrl: z.string(),
      brandName: z.string().min(1),
    }),
  ),
});

type ImportResult = {
  brandId: string;
  brandName: string;
  siteUrl: string;
  success: boolean;
  error?: string;
};

/**
 * POST /api/gsc/import
 *
 * Bulk creates brands from selected GSC sites.
 * Each brand gets a GSC integration linked to the shared credential.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { sharedCredentialId, sites } = parsed.data;

    // Verify credential exists
    const [credential] = await db
      .select()
      .from(sharedCredentials)
      .where(eq(sharedCredentials.id, sharedCredentialId))
      .limit(1);

    if (!credential) {
      return NextResponse.json({ error: 'Shared credential not found' }, { status: 404 });
    }

    const results: ImportResult[] = [];

    // Create brands and integrations for each site
    for (const site of sites) {
      try {
        // Create the brand
        const [brand] = await db
          .insert(brands)
          .values({
            name: site.brandName,
            mode: 'observe',
            modules_enabled: ['gsc_digest', 'trend_scan', 'community_moderation'],
          })
          .returning();

        // Create the GSC integration linked to shared credentials
        await db.insert(brandIntegrations).values({
          brand_id: brand.id,
          type: 'google_search_console',
          shared_credential_id: sharedCredentialId,
          credentials_encrypted: null, // Using shared credential instead
          config: {
            site_url: site.siteUrl, // Used by GSC executors
            siteUrl: site.siteUrl,  // Legacy alias
            scopes: ['webmasters.readonly'],
          },
        });

        results.push({
          brandId: brand.id,
          brandName: site.brandName,
          siteUrl: site.siteUrl,
          success: true,
        });
      } catch (err) {
        results.push({
          brandId: '',
          brandName: site.brandName,
          siteUrl: site.siteUrl,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      message: `Imported ${successCount} brand${successCount !== 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`,
      results,
      successCount,
      failCount,
    });
  } catch (err) {
    console.error('Error importing GSC sites:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 },
    );
  }
}
