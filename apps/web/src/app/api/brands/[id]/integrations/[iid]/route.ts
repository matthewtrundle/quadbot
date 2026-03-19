import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { withRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string; iid: string }> };

/**
 * DELETE /api/brands/[id]/integrations/[iid]
 * Remove an integration by id
 */
export const DELETE = withRateLimit(async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId, iid: integrationId } = await context.params;

  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify the integration exists and belongs to this brand
  const [existing] = await db
    .select({ id: brandIntegrations.id })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.id, integrationId), eq(brandIntegrations.brand_id, brandId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(brandIntegrations).where(eq(brandIntegrations.id, integrationId));

  return NextResponse.json({ ok: true });
});
