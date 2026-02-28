import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { leadLists, leads } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [list] = await db.select().from(leadLists).where(eq(leadLists.id, id)).limit(1);
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const listLeads = await db.select().from(leads).where(eq(leads.lead_list_id, id));
  return NextResponse.json({ ...list, leads: listLeads });
}

const _DELETE = async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [deleted] = await db.delete(leadLists).where(eq(leadLists.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
};
export const DELETE = withRateLimit(_DELETE);
