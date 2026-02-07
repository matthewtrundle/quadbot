import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { brandCreateSchema, brandUpdateSchema } from '@quadbot/shared';

export async function GET() {
  const allBrands = await db.select().from(brands).orderBy(brands.created_at);
  return NextResponse.json({ brands: allBrands });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = brandCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [brand] = await db.insert(brands).values(parsed.data).returning();
  return NextResponse.json(brand, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const parsed = brandUpdateSchema.safeParse(updates);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(brands)
    .set({ ...parsed.data, updated_at: new Date() })
    .where(eq(brands.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
