import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { withRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { brandIntegrations, webhooks } from '@quadbot/db';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/brands/[id]/integrations
 * List all integrations and webhooks for a brand
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await context.params;

  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [integrationRows, webhookRows] = await Promise.all([
    db.select().from(brandIntegrations).where(eq(brandIntegrations.brand_id, brandId)),
    db
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
      .where(eq(webhooks.brand_id, brandId)),
  ]);

  return NextResponse.json({
    integrations: integrationRows,
    webhooks: webhookRows,
  });
}

/**
 * POST /api/brands/[id]/integrations
 * Create a new integration (slack_webhook or discord_webhook)
 */
export const POST = withRateLimit(async function POST(req: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await context.params;

  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { type, config } = body as {
    type: 'slack_webhook' | 'discord_webhook';
    config: { webhook_url: string };
  };

  if (!type || !config?.webhook_url) {
    return NextResponse.json({ error: 'type and config.webhook_url are required' }, { status: 400 });
  }

  // Validate type
  if (!['slack_webhook', 'discord_webhook'].includes(type)) {
    return NextResponse.json({ error: 'type must be slack_webhook or discord_webhook' }, { status: 400 });
  }

  // Validate URL is well-formed
  try {
    new URL(config.webhook_url);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 });
  }

  // Validate URL pattern matches the integration type
  if (type === 'slack_webhook' && !config.webhook_url.includes('hooks.slack.com')) {
    return NextResponse.json({ error: 'Slack webhook URL must contain hooks.slack.com' }, { status: 400 });
  }
  if (type === 'discord_webhook' && !config.webhook_url.includes('discord.com/api/webhooks')) {
    return NextResponse.json({ error: 'Discord webhook URL must contain discord.com/api/webhooks' }, { status: 400 });
  }

  const [created] = await db
    .insert(brandIntegrations)
    .values({
      brand_id: brandId,
      type,
      config: { webhook_url: config.webhook_url },
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
});
