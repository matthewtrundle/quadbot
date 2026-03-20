import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaignTemplates, campaigns, campaignSequenceSteps } from '@quadbot/db';
import { eq, sql, or, ilike, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const search = url.searchParams.get('search');

  const conditions = [];

  if (category) {
    conditions.push(eq(campaignTemplates.category, category));
  }

  if (search) {
    conditions.push(
      or(ilike(campaignTemplates.name, `%${search}%`), ilike(campaignTemplates.description, `%${search}%`))!,
    );
  }

  const query = db.select().from(campaignTemplates).orderBy(desc(campaignTemplates.install_count));

  const result =
    conditions.length > 0
      ? await query.where(conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`)
      : await query;

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { campaignId, brandId, name, description, category, vertical, tags } = body;

  if (!campaignId || !brandId || !name || !description || !category) {
    return NextResponse.json(
      { error: 'campaignId, brandId, name, description, and category are required' },
      { status: 400 },
    );
  }

  // Fetch the source campaign
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // Fetch the campaign's sequence steps
  const steps = await db
    .select()
    .from(campaignSequenceSteps)
    .where(eq(campaignSequenceSteps.campaign_id, campaignId))
    .orderBy(campaignSequenceSteps.step_order);

  const defaultSteps = steps.map((s) => ({
    step_order: s.step_order,
    delay_days: s.delay_days,
    subject_template: s.subject_template,
    body_template: s.body_template,
    is_reply_to_previous: s.is_reply_to_previous,
  }));

  const defaultSchedule = {
    send_days: campaign.send_days as number[] | undefined,
    send_window_start: campaign.send_window_start,
    send_window_end: campaign.send_window_end,
    daily_send_limit: campaign.daily_send_limit,
    timezone: campaign.timezone,
  };

  const [template] = await db
    .insert(campaignTemplates)
    .values({
      name,
      description,
      category,
      vertical: vertical || null,
      default_steps: defaultSteps,
      default_schedule: defaultSchedule,
      tags: tags || [],
      is_system: false,
      created_by_brand_id: brandId,
    })
    .returning();

  return NextResponse.json(template, { status: 201 });
}
