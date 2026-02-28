import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { actionDrafts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { requireActionDraftAccess } from '@/lib/auth-api-keys';
import { getSession } from '@/lib/auth-session';
import { emitEvent } from '@/lib/events';
import { EventType } from '@quadbot/shared';
import { withRateLimit } from '@/lib/rate-limit';

const _POST = async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Brand scope guard — API key or session-based
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const auth = await requireActionDraftAccess(id, req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userBrandId = (session.user as Record<string, unknown>).brandId as string | null;
    if (userBrandId) {
      const [draft] = await db
        .select({ brand_id: actionDrafts.brand_id })
        .from(actionDrafts)
        .where(eq(actionDrafts.id, id))
        .limit(1);
      if (!draft || draft.brand_id !== userBrandId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  const [updated] = await db
    .update(actionDrafts)
    .set({ status: 'rejected', updated_at: new Date() })
    .where(eq(actionDrafts.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Action draft not found' }, { status: 404 });
  }

  // Emit action_draft.rejected event
  await emitEvent(
    EventType.ACTION_DRAFT_REJECTED,
    updated.brand_id,
    { action_draft_id: updated.id, recommendation_id: updated.recommendation_id },
    `rejected:${updated.id}`,
  );

  return NextResponse.json(updated);
};
export const POST = withRateLimit(_POST);
