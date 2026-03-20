import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { campaigns, campaignSequenceSteps } from '@quadbot/db';

interface PlanStep {
  step_order: number;
  delay_days: number;
  subject_template: string;
  body_template: string;
  is_reply_to_previous?: boolean;
}

interface PlanSchedule {
  send_days?: number[];
  send_window_start?: string;
  send_window_end?: string;
  daily_send_limit?: number;
}

interface CampaignPlan {
  name: string;
  description?: string;
  reply_mode?: string;
  schedule?: PlanSchedule;
  steps: PlanStep[];
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { brandId, plan } = body as { brandId: string; plan: CampaignPlan };

  if (!brandId || !plan) {
    return NextResponse.json({ error: 'brandId and plan are required' }, { status: 400 });
  }

  if (!plan.name || !plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return NextResponse.json({ error: 'Plan must include name and at least one step' }, { status: 400 });
  }

  // Create the campaign
  const schedule = plan.schedule || {};
  const [campaign] = await db
    .insert(campaigns)
    .values({
      brand_id: brandId,
      name: plan.name,
      description: plan.description || null,
      status: 'draft',
      reply_mode: (plan.reply_mode as 'manual' | 'ai_draft_approve' | 'ai_auto_reply') || 'manual',
      send_days: schedule.send_days || [1, 2, 3, 4, 5],
      send_window_start: schedule.send_window_start || '09:00',
      send_window_end: schedule.send_window_end || '17:00',
      daily_send_limit: schedule.daily_send_limit || 50,
    })
    .returning();

  // Create all sequence steps
  const createdSteps = [];
  for (const step of plan.steps) {
    const [created] = await db
      .insert(campaignSequenceSteps)
      .values({
        campaign_id: campaign.id,
        step_order: step.step_order,
        delay_days: step.delay_days,
        subject_template: step.subject_template,
        body_template: step.body_template,
        is_reply_to_previous: step.is_reply_to_previous ?? false,
      })
      .returning();
    createdSteps.push(created);
  }

  return NextResponse.json({ ...campaign, steps: createdSteps }, { status: 201 });
}
