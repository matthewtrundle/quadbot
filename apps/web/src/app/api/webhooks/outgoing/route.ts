import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { webhooks } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

/**
 * GET /api/webhooks/outgoing?brand_id=X
 * List all outgoing webhooks for a brand
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get('brand_id');
  if (!brandId) return NextResponse.json({ error: 'brand_id required' }, { status: 400 });

  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const results = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      event_types: webhooks.event_types,
      is_active: webhooks.is_active,
      failure_count: webhooks.failure_count,
      last_triggered_at: webhooks.last_triggered_at,
      created_at: webhooks.created_at,
    })
    .from(webhooks)
    .where(eq(webhooks.brand_id, brandId));

  return NextResponse.json(results);
}

/**
 * POST /api/webhooks/outgoing
 * Create a new outgoing webhook
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { brand_id, url, event_types } = body as {
    brand_id: string;
    url: string;
    event_types?: string[];
  };

  if (!brand_id || !url) {
    return NextResponse.json({ error: 'brand_id and url are required' }, { status: 400 });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brand_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Generate a signing secret
  const secret = randomBytes(32).toString('hex');

  const [created] = await db.insert(webhooks).values({
    brand_id,
    url,
    event_types: event_types || [],
    secret,
  }).returning();

  return NextResponse.json({
    id: created.id,
    url: created.url,
    event_types: created.event_types,
    secret, // Only shown once at creation time
    is_active: created.is_active,
    created_at: created.created_at,
  }, { status: 201 });
}

/**
 * DELETE /api/webhooks/outgoing?id=X
 * Delete an outgoing webhook
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const webhookId = req.nextUrl.searchParams.get('id');
  if (!webhookId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Verify ownership
  const [wh] = await db
    .select({ id: webhooks.id, brand_id: webhooks.brand_id })
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .limit(1);

  if (!wh) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== wh.brand_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.delete(webhooks).where(eq(webhooks.id, webhookId));

  return NextResponse.json({ ok: true });
}
