import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { outreachMessages, outreachConversations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

const _POST = async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: conversationId, mid: messageId } = await params;

  const [message] = await db
    .select()
    .from(outreachMessages)
    .where(and(eq(outreachMessages.id, messageId), eq(outreachMessages.conversation_id, conversationId)))
    .limit(1);

  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  if (!message.ai_generated) return NextResponse.json({ error: 'Not an AI-generated message' }, { status: 400 });

  await db
    .update(outreachMessages)
    .set({ ai_approved: false, ai_approved_at: new Date() })
    .where(eq(outreachMessages.id, messageId));

  await db
    .update(outreachConversations)
    .set({ ai_draft_pending: false, updated_at: new Date() })
    .where(eq(outreachConversations.id, conversationId));

  return NextResponse.json({ rejected: true });
};
export const POST = withRateLimit(_POST);
