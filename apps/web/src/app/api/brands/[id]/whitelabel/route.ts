import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brandWhitelabel } from '@quadbot/db';
import { eq } from 'drizzle-orm';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: brandId } = await params;

  const [config] = await db.select().from(brandWhitelabel).where(eq(brandWhitelabel.brand_id, brandId)).limit(1);

  return NextResponse.json({ config: config ?? null });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const body = await req.json();

  // Strip fields that shouldn't be set by the client
  const { id: _id, brand_id: _brandId, created_at: _ca, updated_at: _ua, ...updates } = body;

  const [result] = await db
    .insert(brandWhitelabel)
    .values({ brand_id: brandId, ...updates })
    .onConflictDoUpdate({
      target: brandWhitelabel.brand_id,
      set: { ...updates, updated_at: new Date() },
    })
    .returning();

  return NextResponse.json({ config: result });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;

  await db.delete(brandWhitelabel).where(eq(brandWhitelabel.brand_id, brandId));

  return NextResponse.json({ success: true });
}
