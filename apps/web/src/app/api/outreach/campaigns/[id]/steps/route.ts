import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaignSequenceSteps } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { createSequenceStepSchema, bulkSequenceStepsSchema } from '@quadbot/shared';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId } = await params;

  const steps = await db
    .select()
    .from(campaignSequenceSteps)
    .where(eq(campaignSequenceSteps.campaign_id, campaignId))
    .orderBy(campaignSequenceSteps.step_order);

  return NextResponse.json(steps);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId } = await params;

  const body = await req.json();
  const parsed = createSequenceStepSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [created] = await db
    .insert(campaignSequenceSteps)
    .values({ campaign_id: campaignId, ...parsed.data })
    .returning();

  return NextResponse.json(created, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId } = await params;

  const body = await req.json();
  const parsed = bulkSequenceStepsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Replace all steps
  await db.delete(campaignSequenceSteps).where(eq(campaignSequenceSteps.campaign_id, campaignId));

  const created = [];
  for (const step of parsed.data) {
    const [s] = await db
      .insert(campaignSequenceSteps)
      .values({ campaign_id: campaignId, ...step })
      .returning();
    created.push(s);
  }

  return NextResponse.json(created);
}
