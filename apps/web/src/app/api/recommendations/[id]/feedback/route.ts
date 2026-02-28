import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { recommendations } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

const _POST = async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { rating, comment } = body as { rating: string; comment?: string };

  if (!['helpful', 'not_helpful', 'harmful'].includes(rating)) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
  }

  // Verify recommendation exists
  const [rec] = await db
    .select({ id: recommendations.id, data: recommendations.data })
    .from(recommendations)
    .where(eq(recommendations.id, id))
    .limit(1);

  if (!rec) {
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
  }

  // Store feedback in the recommendation's data JSONB
  const existingData = (rec.data || {}) as Record<string, unknown>;
  const feedback = {
    rating,
    comment: comment || null,
    user_id: session.user.id,
    submitted_at: new Date().toISOString(),
  };

  await db
    .update(recommendations)
    .set({
      data: { ...existingData, user_feedback: feedback },
    })
    .where(eq(recommendations.id, id));

  return NextResponse.json({ ok: true, feedback });
};
export const POST = withRateLimit(_POST);
