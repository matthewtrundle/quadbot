import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { outreachAccounts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { updateOutreachAccountSchema } from '@quadbot/shared';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateOutreachAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(outreachAccounts)
    .set({ ...parsed.data, updated_at: new Date() })
    .where(eq(outreachAccounts.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    from_name: updated.from_name,
    daily_limit: updated.daily_limit,
    status: updated.status,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const [deleted] = await db
    .update(outreachAccounts)
    .set({ status: 'disabled', updated_at: new Date() })
    .where(eq(outreachAccounts.id, id))
    .returning();

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ disabled: true });
}
