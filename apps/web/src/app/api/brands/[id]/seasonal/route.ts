import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { seasonalTopics } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const monthFilter = searchParams.get('month');

  const conditions = [eq(seasonalTopics.brand_id, brandId)];
  if (statusFilter) {
    conditions.push(eq(seasonalTopics.status, statusFilter));
  }
  if (monthFilter) {
    conditions.push(eq(seasonalTopics.peak_month, parseInt(monthFilter, 10)));
  }

  const topics = await db
    .select()
    .from(seasonalTopics)
    .where(and(...conditions))
    .orderBy(desc(seasonalTopics.priority_score));

  // Compute counts
  const allTopics =
    statusFilter || monthFilter
      ? await db.select().from(seasonalTopics).where(eq(seasonalTopics.brand_id, brandId))
      : topics;

  const counts = {
    total: allTopics.length,
    upcoming: allTopics.filter((t) => t.status === 'upcoming').length,
    in_progress: allTopics.filter((t) => t.status === 'in_progress').length,
    published: allTopics.filter((t) => t.status === 'published').length,
    skipped: allTopics.filter((t) => t.status === 'skipped').length,
    highPriority: allTopics.filter((t) => (t.priority_score ?? 0) > 70).length,
  };

  return NextResponse.json({ topics, counts });
}

export async function PATCH(req: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { topicId, status } = body as { topicId: string; status: string };

  if (!topicId || !status) {
    return NextResponse.json({ error: 'Missing topicId or status' }, { status: 400 });
  }

  const validStatuses = ['upcoming', 'in_progress', 'published', 'skipped'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  await db.update(seasonalTopics).set({ status, updated_at: new Date() }).where(eq(seasonalTopics.id, topicId));

  return NextResponse.json({ success: true });
}
