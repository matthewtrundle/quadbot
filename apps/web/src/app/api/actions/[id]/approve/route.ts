import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { actionDrafts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { requireActionDraftAccess } from '@/lib/auth';
import { emitEvent } from '@/lib/events';
import { EventType } from '@quadbot/shared';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Brand scope guard (only if API key provided; UI requests without key still pass)
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const auth = await requireActionDraftAccess(id, req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const [updated] = await db
    .update(actionDrafts)
    .set({ status: 'approved', updated_at: new Date() })
    .where(eq(actionDrafts.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Action draft not found' }, { status: 404 });
  }

  // Emit action_draft.approved event
  await emitEvent(
    EventType.ACTION_DRAFT_APPROVED,
    updated.brand_id,
    { action_draft_id: updated.id, recommendation_id: updated.recommendation_id },
    `approved:${updated.id}`,
  );

  return NextResponse.json(updated);
}
