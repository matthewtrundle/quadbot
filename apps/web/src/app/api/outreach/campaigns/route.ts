import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignSequenceSteps, campaignLeads } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';
import { createCampaignSchema } from '@quadbot/shared';
import { withRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

  const result = await db.select().from(campaigns).where(eq(campaigns.brand_id, brandId))
    .orderBy(sql`${campaigns.created_at} DESC`);

  return NextResponse.json(result);
}

const _POST = async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

  const body = await req.json();
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [created] = await db
    .insert(campaigns)
    .values({ brand_id: brandId, ...parsed.data })
    .returning();

  return NextResponse.json(created, { status: 201 });
};
export const POST = withRateLimit(_POST);
