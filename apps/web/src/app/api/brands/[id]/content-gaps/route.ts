import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { contentGaps } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');

  const conditions = [eq(contentGaps.brand_id, brandId)];
  if (statusFilter) {
    conditions.push(eq(contentGaps.status, statusFilter));
  }

  const gaps = await db
    .select()
    .from(contentGaps)
    .where(and(...conditions))
    .orderBy(desc(contentGaps.opportunity_score));

  // Compute counts
  const allGaps = statusFilter ? await db.select().from(contentGaps).where(eq(contentGaps.brand_id, brandId)) : gaps;

  const counts = {
    total: allGaps.length,
    open: allGaps.filter((g) => g.status === 'open').length,
    planned: allGaps.filter((g) => g.status === 'planned').length,
    created: allGaps.filter((g) => g.status === 'created').length,
    dismissed: allGaps.filter((g) => g.status === 'dismissed').length,
    highValue: allGaps.filter((g) => g.opportunity_score > 70).length,
  };

  return NextResponse.json({ gaps, counts });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, status } = body as { id: string; status: string };

  if (!id || !status) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
  }

  const validStatuses = ['open', 'planned', 'created', 'dismissed'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  await db.update(contentGaps).set({ status }).where(eq(contentGaps.id, id));

  return NextResponse.json({ success: true });
}
