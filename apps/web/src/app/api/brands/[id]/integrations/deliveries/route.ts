import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { webhooks, webhookDeliveries } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/brands/[id]/integrations/deliveries?webhookId=...&limit=50
 * List recent webhook deliveries for a brand
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await context.params;

  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const webhookId = req.nextUrl.searchParams.get('webhookId');
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 100);

  // Build conditions: always filter by brand through the webhooks join
  const conditions = [eq(webhooks.brand_id, brandId)];
  if (webhookId) {
    conditions.push(eq(webhookDeliveries.webhook_id, webhookId));
  }

  const results = await db
    .select({
      id: webhookDeliveries.id,
      webhook_id: webhookDeliveries.webhook_id,
      webhook_url: webhooks.url,
      event_type: webhookDeliveries.event_type,
      status_code: webhookDeliveries.status_code,
      success: webhookDeliveries.success,
      duration_ms: webhookDeliveries.duration_ms,
      error: webhookDeliveries.error,
      created_at: webhookDeliveries.created_at,
    })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhookDeliveries.webhook_id, webhooks.id))
    .where(and(...conditions))
    .orderBy(desc(webhookDeliveries.created_at))
    .limit(limit);

  return NextResponse.json(results);
}
