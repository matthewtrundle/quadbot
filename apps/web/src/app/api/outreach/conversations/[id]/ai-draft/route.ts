import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { outreachConversations, jobs } from '@quadbot/db';
import { JobType } from '@quadbot/shared';
import { enqueueJob } from '@/lib/queue';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: conversationId } = await params;

  const [conversation] = await db
    .select()
    .from(outreachConversations)
    .where(eq(outreachConversations.id, conversationId))
    .limit(1);
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const jobId = randomUUID();
  await db.insert(jobs).values({
    id: jobId,
    brand_id: conversation.brand_id,
    type: JobType.OUTREACH_AI_REPLY,
    status: 'queued',
    payload: {
      conversation_id: conversationId,
      campaign_id: conversation.campaign_id,
      reply_mode: 'ai_draft_approve',
    },
  });

  await enqueueJob({
    jobId,
    type: JobType.OUTREACH_AI_REPLY,
    payload: {
      brand_id: conversation.brand_id,
      conversation_id: conversationId,
      campaign_id: conversation.campaign_id,
      reply_mode: 'ai_draft_approve',
    },
  });

  await db
    .update(outreachConversations)
    .set({ ai_draft_pending: true, updated_at: new Date() })
    .where(eq(outreachConversations.id, conversationId));

  return NextResponse.json({ jobId, status: 'queued' }, { status: 202 });
}
