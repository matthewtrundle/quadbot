import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { clientReports } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// GET /api/brands/[id]/reports/[rid]
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id: brandId, rid: reportId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Fetch report ---
  const [report] = await db
    .select()
    .from(clientReports)
    .where(and(eq(clientReports.id, reportId), eq(clientReports.brand_id, brandId)))
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  return NextResponse.json(report);
}

// ---------------------------------------------------------------------------
// DELETE /api/brands/[id]/reports/[rid]
// ---------------------------------------------------------------------------
async function deleteHandler(_req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id: brandId, rid: reportId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Delete report ---
  const deleted = await db
    .delete(clientReports)
    .where(and(eq(clientReports.id, reportId), eq(clientReports.brand_id, brandId)))
    .returning({ id: clientReports.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, id: deleted[0].id });
}

export const DELETE = withRateLimit(deleteHandler, { maxRequests: 30, windowMs: 60_000 });
