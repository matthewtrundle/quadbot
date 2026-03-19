import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { reportSchedules } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function calculateNextRunAt(frequency: 'weekly' | 'monthly'): Date {
  const now = new Date();
  if (frequency === 'weekly') {
    // Next Monday at 9:00 AM UTC
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + daysUntilMonday);
    next.setUTCHours(9, 0, 0, 0);
    return next;
  }
  // Monthly: 1st of next month at 9:00 AM UTC
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 9, 0, 0, 0));
  return next;
}

// ---------------------------------------------------------------------------
// GET /api/brands/[id]/reports/schedule
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Fetch schedule ---
  const [schedule] = await db.select().from(reportSchedules).where(eq(reportSchedules.brand_id, brandId)).limit(1);

  if (!schedule) {
    return NextResponse.json(null);
  }

  return NextResponse.json(schedule);
}

// ---------------------------------------------------------------------------
// PUT /api/brands/[id]/reports/schedule
// ---------------------------------------------------------------------------
async function putHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Parse body ---
  let body: {
    frequency: 'weekly' | 'monthly';
    recipientEmails: string[];
    isActive: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.frequency || !['weekly', 'monthly'].includes(body.frequency)) {
    return NextResponse.json({ error: 'frequency must be "weekly" or "monthly"' }, { status: 400 });
  }

  if (!Array.isArray(body.recipientEmails)) {
    return NextResponse.json({ error: 'recipientEmails must be an array' }, { status: 400 });
  }

  const nextRunAt = calculateNextRunAt(body.frequency);

  // --- Upsert schedule ---
  const [existing] = await db
    .select({ id: reportSchedules.id })
    .from(reportSchedules)
    .where(eq(reportSchedules.brand_id, brandId))
    .limit(1);

  let schedule;

  if (existing) {
    [schedule] = await db
      .update(reportSchedules)
      .set({
        frequency: body.frequency,
        recipient_emails: body.recipientEmails,
        is_active: body.isActive,
        next_run_at: nextRunAt,
        updated_at: new Date(),
      })
      .where(eq(reportSchedules.id, existing.id))
      .returning();
  } else {
    [schedule] = await db
      .insert(reportSchedules)
      .values({
        brand_id: brandId,
        frequency: body.frequency,
        recipient_emails: body.recipientEmails,
        is_active: body.isActive,
        next_run_at: nextRunAt,
      })
      .returning();
  }

  return NextResponse.json(schedule);
}

export const PUT = withRateLimit(putHandler, { maxRequests: 20, windowMs: 60_000 });

// ---------------------------------------------------------------------------
// DELETE /api/brands/[id]/reports/schedule
// ---------------------------------------------------------------------------
async function deleteHandler(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Delete schedule ---
  const deleted = await db
    .delete(reportSchedules)
    .where(eq(reportSchedules.brand_id, brandId))
    .returning({ id: reportSchedules.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'No schedule found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const DELETE = withRateLimit(deleteHandler, { maxRequests: 20, windowMs: 60_000 });
