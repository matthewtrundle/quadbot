import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { notifications } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get('brand_id') || (session.user as UserWithBrand).brandId;
  if (!brandId) {
    return NextResponse.json({ error: 'brand_id required' }, { status: 400 });
  }

  // Non-admin users can only see their own brand's notifications
  if (!isAdmin(session) && brandId !== (session.user as UserWithBrand).brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const unreadOnly = req.nextUrl.searchParams.get('unread') === 'true';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 100);

  const conditions = [eq(notifications.brand_id, brandId)];
  if (unreadOnly) {
    conditions.push(eq(notifications.read, false));
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.created_at))
    .limit(limit);

  // Get unread count
  const unreadRows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.brand_id, brandId), eq(notifications.read, false)));

  return NextResponse.json({
    notifications: rows,
    unread_count: unreadRows.length,
  });
}

const _PATCH = async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { notification_id, mark_all_read, brand_id } = body;

  if (mark_all_read && brand_id) {
    // Non-admin users can only mark their own brand's notifications
    if (!isAdmin(session) && brand_id !== (session.user as UserWithBrand).brandId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.brand_id, brand_id), eq(notifications.read, false)));

    return NextResponse.json({ ok: true });
  }

  if (notification_id) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, notification_id));

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'notification_id or mark_all_read+brand_id required' }, { status: 400 });
};
export const PATCH = withRateLimit(_PATCH);
