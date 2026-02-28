import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { leadLists } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { createLeadListSchema } from '@quadbot/shared';
import { withRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

  const lists = await db.select().from(leadLists).where(eq(leadLists.brand_id, brandId));
  return NextResponse.json(lists);
}

const _POST = async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 });

  const body = await req.json();
  const parsed = createLeadListSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [created] = await db
    .insert(leadLists)
    .values({ brand_id: brandId, ...parsed.data })
    .returning();

  return NextResponse.json(created, { status: 201 });
};
export const POST = withRateLimit(_POST);
