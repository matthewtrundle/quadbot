import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaignAbTests, campaigns } from '@quadbot/db';
import { eq } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId } = await params;

  // Verify campaign exists
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const tests = await db
    .select()
    .from(campaignAbTests)
    .where(eq(campaignAbTests.campaign_id, campaignId))
    .orderBy(campaignAbTests.created_at);

  return NextResponse.json(tests);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: campaignId } = await params;

  // Verify campaign exists
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const body = await req.json();
  const { name, test_type, variant_a, variant_b, split_percentage } = body;

  if (!name || !test_type || !variant_a || !variant_b) {
    return NextResponse.json({ error: 'name, test_type, variant_a, and variant_b are required' }, { status: 400 });
  }

  const [test] = await db
    .insert(campaignAbTests)
    .values({
      campaign_id: campaignId,
      name,
      test_type,
      variant_a,
      variant_b,
      split_percentage: split_percentage ?? 50,
      status: 'active',
      started_at: new Date(),
    })
    .returning();

  return NextResponse.json(test, { status: 201 });
}
