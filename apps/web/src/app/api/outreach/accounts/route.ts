import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { outreachAccounts, encrypt } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { createOutreachAccountSchema } from '@quadbot/shared';

async function getBrandId(req: NextRequest): Promise<{ brandId: string } | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });
  const userBrandId = (session.user as any).brandId as string | null;
  if (!isAdmin(session) && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { brandId };
}

export async function GET(req: NextRequest) {
  const result = await getBrandId(req);
  if (result instanceof NextResponse) return result;

  const accounts = await db
    .select({
      id: outreachAccounts.id,
      email: outreachAccounts.email,
      from_name: outreachAccounts.from_name,
      daily_limit: outreachAccounts.daily_limit,
      sent_today: outreachAccounts.sent_today,
      status: outreachAccounts.status,
      last_used_at: outreachAccounts.last_used_at,
      total_sent: outreachAccounts.total_sent,
      total_bounced: outreachAccounts.total_bounced,
      bounce_rate: outreachAccounts.bounce_rate,
      created_at: outreachAccounts.created_at,
    })
    .from(outreachAccounts)
    .where(eq(outreachAccounts.brand_id, result.brandId));

  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const result = await getBrandId(req);
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const parsed = createOutreachAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const encrypted = encrypt(parsed.data.resend_api_key);

  const [created] = await db
    .insert(outreachAccounts)
    .values({
      brand_id: result.brandId,
      email: parsed.data.email,
      from_name: parsed.data.from_name,
      resend_api_key_encrypted: encrypted,
      daily_limit: parsed.data.daily_limit,
    })
    .returning();

  return NextResponse.json({
    id: created.id,
    email: created.email,
    from_name: created.from_name,
    daily_limit: created.daily_limit,
    status: created.status,
  }, { status: 201 });
}
