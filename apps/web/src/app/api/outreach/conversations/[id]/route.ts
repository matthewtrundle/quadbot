import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { outreachConversations, outreachMessages, leads, campaigns } from '@quadbot/db';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [conversation] = await db
    .select()
    .from(outreachConversations)
    .where(eq(outreachConversations.id, id))
    .limit(1);

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const messages = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.conversation_id, id))
    .orderBy(asc(outreachMessages.created_at));

  const [lead] = await db.select().from(leads).where(eq(leads.id, conversation.lead_id)).limit(1);
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, conversation.campaign_id)).limit(1);

  return NextResponse.json({
    ...conversation,
    messages,
    lead,
    campaign,
  });
}
