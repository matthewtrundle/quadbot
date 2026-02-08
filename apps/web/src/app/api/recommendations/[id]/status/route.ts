import { NextRequest, NextResponse } from 'next/server';
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
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
