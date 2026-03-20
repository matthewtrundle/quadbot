import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { artifacts } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { withRateLimit } from '@/lib/rate-limit';

const _POST = async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { artifactId, scheduledPublishAt } = body as {
    artifactId: string;
    scheduledPublishAt: string;
  };

  if (!artifactId || !scheduledPublishAt) {
    return NextResponse.json({ error: 'artifactId and scheduledPublishAt are required' }, { status: 400 });
  }

  // Validate the date
  const scheduledDate = new Date(scheduledPublishAt);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  // Verify the artifact belongs to this brand and is a draft
  const [artifact] = await db
    .select({
      id: artifacts.id,
      brand_id: artifacts.brand_id,
      status: artifacts.status,
    })
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.brand_id, brandId)))
    .limit(1);

  if (!artifact) {
    return NextResponse.json({ error: 'Artifact not found for this brand' }, { status: 404 });
  }

  if (artifact.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft artifacts can be scheduled' }, { status: 400 });
  }

  // Update scheduled_publish_at
  const [updated] = await db
    .update(artifacts)
    .set({ scheduled_publish_at: scheduledDate })
    .where(eq(artifacts.id, artifactId))
    .returning();

  return NextResponse.json({ ok: true, artifact: updated });
};

const _DELETE = async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { artifactId } = body as { artifactId: string };

  if (!artifactId) {
    return NextResponse.json({ error: 'artifactId is required' }, { status: 400 });
  }

  // Verify the artifact belongs to this brand
  const [artifact] = await db
    .select({ id: artifacts.id, brand_id: artifacts.brand_id })
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.brand_id, brandId)))
    .limit(1);

  if (!artifact) {
    return NextResponse.json({ error: 'Artifact not found for this brand' }, { status: 404 });
  }

  // Clear scheduled_publish_at
  const [updated] = await db
    .update(artifacts)
    .set({ scheduled_publish_at: null })
    .where(eq(artifacts.id, artifactId))
    .returning();

  return NextResponse.json({ ok: true, artifact: updated });
};

export const POST = withRateLimit(_POST);
export const DELETE = withRateLimit(_DELETE);
