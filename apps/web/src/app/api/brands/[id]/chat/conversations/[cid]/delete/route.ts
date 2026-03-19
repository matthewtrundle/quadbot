import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@quadbot/db';
import { eq } from 'drizzle-orm';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId, cid } = await params;
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);

  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.delete(chatMessages).where(eq(chatMessages.conversation_id, cid));

  await db.delete(chatConversations).where(eq(chatConversations.id, cid));

  return NextResponse.json({ ok: true });
}
