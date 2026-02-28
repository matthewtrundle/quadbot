import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brandIntegrations, encrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const webhookSchema = z.object({
  type: z.enum(['slack_webhook', 'discord_webhook']),
  webhook_url: z.string().url(),
});

async function verifyBrandAccess(brandId: string): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function validateWebhookUrl(type: string, url: string): boolean {
  try {
    const parsed = new URL(url);
    if (type === 'slack_webhook') {
      return parsed.hostname === 'hooks.slack.com' && parsed.protocol === 'https:';
    }
    if (type === 'discord_webhook') {
      return (
        parsed.hostname === 'discord.com' && parsed.pathname.startsWith('/api/webhooks') && parsed.protocol === 'https:'
      );
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * GET /api/brands/:id/notifications
 * List configured notification webhooks for a brand.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;
  const denied = await verifyBrandAccess(brandId);
  if (denied) return denied;

  const integrations = await db
    .select({
      id: brandIntegrations.id,
      type: brandIntegrations.type,
      created_at: brandIntegrations.created_at,
    })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId)));

  // Filter to only notification webhook types
  const webhooks = integrations.filter((i) => i.type === 'slack_webhook' || i.type === 'discord_webhook');

  return NextResponse.json(webhooks);
}

/**
 * POST /api/brands/:id/notifications
 * Add a Slack or Discord webhook for a brand.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;
  const denied = await verifyBrandAccess(brandId);
  if (denied) return denied;

  const body = await req.json();
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { type, webhook_url } = parsed.data;

  if (!validateWebhookUrl(type, webhook_url)) {
    return NextResponse.json({ error: `Invalid webhook URL for ${type}` }, { status: 400 });
  }

  // Upsert: delete existing of same type, then insert new
  await db
    .delete(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, type)));

  const [created] = await db
    .insert(brandIntegrations)
    .values({
      brand_id: brandId,
      type,
      credentials_encrypted: encrypt(JSON.stringify({ webhook_url })),
    })
    .returning({
      id: brandIntegrations.id,
      type: brandIntegrations.type,
      created_at: brandIntegrations.created_at,
    });

  return NextResponse.json(created, { status: 201 });
}

/**
 * DELETE /api/brands/:id/notifications
 * Remove a notification webhook by type.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;
  const denied = await verifyBrandAccess(brandId);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  if (!type || !['slack_webhook', 'discord_webhook'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  }

  await db
    .delete(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, type)));

  return NextResponse.json({ deleted: true });
}
