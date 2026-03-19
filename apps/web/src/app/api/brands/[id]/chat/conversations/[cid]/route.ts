import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@quadbot/db';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId, cid } = await params;
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);

  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, cid)).limit(1);

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversation_id, cid))
    .orderBy(asc(chatMessages.created_at));

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_results: m.tool_results,
      created_at: m.created_at,
    })),
  });
}
