import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignSequenceSteps } from '@quadbot/db';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  // Fetch the source campaign
  const [source] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);

  if (!source) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Allow optional name override
  let overrideName: string | undefined;
  try {
    const body = await req.json();
    overrideName = body.name;
  } catch {
    // No body or invalid JSON is fine — use default name
  }

  // Create cloned campaign with draft status
  const [cloned] = await db
    .insert(campaigns)
    .values({
      brand_id: source.brand_id,
      name: overrideName || `${source.name} (Copy)`,
      description: source.description,
      status: 'draft',
      reply_mode: source.reply_mode,
      ai_reply_context: source.ai_reply_context,
      ai_reply_tone: source.ai_reply_tone,
      timezone: source.timezone,
      send_days: source.send_days,
      send_window_start: source.send_window_start,
      send_window_end: source.send_window_end,
      daily_send_limit: source.daily_send_limit,
      min_spacing_seconds: source.min_spacing_seconds,
      max_spacing_seconds: source.max_spacing_seconds,
    })
    .returning();

  // Copy all sequence steps
  const steps = await db
    .select()
    .from(campaignSequenceSteps)
    .where(eq(campaignSequenceSteps.campaign_id, id))
    .orderBy(campaignSequenceSteps.step_order);

  const clonedSteps = [];
  for (const step of steps) {
    const [clonedStep] = await db
      .insert(campaignSequenceSteps)
      .values({
        campaign_id: cloned.id,
        step_order: step.step_order,
        delay_days: step.delay_days,
        subject_template: step.subject_template,
        body_template: step.body_template,
        is_reply_to_previous: step.is_reply_to_previous,
      })
      .returning();
    clonedSteps.push(clonedStep);
  }

  return NextResponse.json({ ...cloned, steps: clonedSteps }, { status: 201 });
}
