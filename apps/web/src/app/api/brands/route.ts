import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands, jobs, users } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { brandCreateSchema, brandUpdateSchema } from '@quadbot/shared';
import { enqueueJob } from '@/lib/queue';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);

  const allBrands = !admin && userBrandId
    ? await db.select().from(brands).where(eq(brands.id, userBrandId)).orderBy(brands.created_at)
    : await db.select().from(brands).orderBy(brands.created_at);
  return NextResponse.json({ brands: allBrands });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = brandCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [brand] = await db.insert(brands).values(parsed.data).returning();

  // Associate brand with the creating user
  try {
    await db.update(users).set({ brandId: brand.id }).where(eq(users.id, session.user.id));
  } catch (err) {
    console.error('Failed to associate brand with user:', err);
  }

  // Auto-trigger brand profiler to detect brand profile from website
  try {
    const jobId = randomUUID();
    await db.insert(jobs).values({
      id: jobId,
      brand_id: brand.id,
      type: 'brand_profiler',
      status: 'queued',
      payload: {},
    });
    await enqueueJob({
      jobId,
      type: 'brand_profiler',
      payload: { brand_id: brand.id },
    });
  } catch (err) {
    // Non-critical — brand profiler will run lazily on first trend scan
    console.error('Failed to enqueue brand profiler:', err);
  }

  return NextResponse.json(brand, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  if (!admin && userBrandId && userBrandId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
