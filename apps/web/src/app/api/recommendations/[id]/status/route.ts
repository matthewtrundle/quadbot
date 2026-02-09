import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { z } from 'zod';
import { db } from '@/lib/db';
import { recommendations } from '@quadbot/db';
import { eq } from 'drizzle-orm';

const statusSchema = z.object({
  status: z.enum(['active', 'dismissed', 'bookmarked']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const parsed = statusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { status } = parsed.data;
    const dismissed_at = status === 'dismissed' ? new Date() : null;

    const [updated] = await db
      .update(recommendations)
      .set({ status, dismissed_at })
      .where(eq(recommendations.id, id))
      .returning({ id: recommendations.id, status: recommendations.status });

    if (!updated) {
      return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error('PATCH /api/recommendations/[id]/status error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
