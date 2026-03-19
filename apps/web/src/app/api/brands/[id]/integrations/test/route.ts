import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { withRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { webhooks, webhookDeliveries, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { createHmac } from 'node:crypto';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/brands/[id]/integrations/test
 * Send a test event to a webhook or integration
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
  const { webhookId, integrationType } = body as {
    webhookId?: string;
    integrationType?: string;
  };

  if (!webhookId && !integrationType) {
    return NextResponse.json({ error: 'webhookId or integrationType is required' }, { status: 400 });
  }

  // Test an outgoing webhook
  if (webhookId) {
    return await testWebhook(brandId, webhookId);
  }

  // Test a Slack or Discord integration
  return await testIntegration(brandId, integrationType!);
});

async function testWebhook(brandId: string, webhookId: string) {
  const [wh] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.brand_id, brandId)))
    .limit(1);

  if (!wh) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }

  const payload = {
    event: 'test',
    brand_id: brandId,
    timestamp: new Date().toISOString(),
    data: { message: 'Test webhook from QuadBot' },
  };

  const payloadStr = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Sign with HMAC if a secret exists
  if (wh.secret) {
    const signature = createHmac('sha256', wh.secret).update(payloadStr).digest('hex');
    headers['X-QuadBot-Signature'] = `sha256=${signature}`;
  }

  const start = Date.now();
  let statusCode: number | null = null;
  let success = false;
  let error: string | null = null;
  let responseBody: string | null = null;

  try {
    const resp = await fetch(wh.url, {
      method: 'POST',
      headers,
      body: payloadStr,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = resp.status;
    responseBody = await resp.text().catch(() => null);
    success = resp.ok;
    if (!resp.ok) {
      error = `HTTP ${resp.status}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  const durationMs = Date.now() - start;

  // Record delivery
  await db.insert(webhookDeliveries).values({
    webhook_id: webhookId,
    event_type: 'test',
    payload,
    status_code: statusCode,
    response_body: responseBody,
    duration_ms: durationMs,
    success,
    error,
  });

  return NextResponse.json({
    success,
    status_code: statusCode,
    duration_ms: durationMs,
    error,
  });
}

async function testIntegration(brandId: string, integrationType: string) {
  if (!['slack_webhook', 'discord_webhook'].includes(integrationType)) {
    return NextResponse.json({ error: 'Unsupported integration type' }, { status: 400 });
  }

  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, integrationType)))
    .limit(1);

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  const config = integration.config as { webhook_url?: string } | null;
  if (!config?.webhook_url) {
    return NextResponse.json({ error: 'Integration has no webhook URL configured' }, { status: 400 });
  }

  let payload: unknown;

  if (integrationType === 'slack_webhook') {
    payload = {
      text: '\uD83D\uDD14 Test notification from QuadBot',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*QuadBot Test*\nThis is a test notification from QuadBot. Your Slack integration is working correctly!',
          },
        },
      ],
    };
  } else {
    // discord_webhook
    payload = {
      embeds: [
        {
          title: 'Test',
          description: 'Test notification from QuadBot',
          color: 0x2563eb,
        },
      ],
    };
  }

  let success = false;
  let statusCode: number | null = null;
  let error: string | null = null;

  try {
    const resp = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = resp.status;
    success = resp.ok;
    if (!resp.ok) {
      error = `HTTP ${resp.status}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  return NextResponse.json({
    success,
    status_code: statusCode,
    error,
  });
}
