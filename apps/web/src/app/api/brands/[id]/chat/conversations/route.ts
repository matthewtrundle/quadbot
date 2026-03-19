import { NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@quadbot/db';
import { eq, desc, count } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: brandId } = await params;

  // Non-admin users can only access their own brand
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  if (!isAdmin(session) && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      created_at: chatConversations.created_at,
      updated_at: chatConversations.updated_at,
      message_count: count(chatMessages.id),
    })
    .from(chatConversations)
    .leftJoin(chatMessages, eq(chatMessages.conversation_id, chatConversations.id))
    .where(eq(chatConversations.brand_id, brandId))
    .groupBy(chatConversations.id)
    .orderBy(desc(chatConversations.updated_at))
    .limit(50);

  return NextResponse.json({ conversations: rows });
}
