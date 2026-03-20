import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are an expert email marketing strategist specializing in B2B outreach campaigns. Your job is to generate high-converting, personalized email sequences.

Guidelines:
- Generate a multi-step email sequence (3-5 steps typically)
- Use template variables: {{first_name}}, {{last_name}}, {{company}}, {{title}}
- Write engaging subject lines with personalization
- Write professional, concise email bodies (HTML format)
- Set appropriate delays between steps (1-7 days)
- The first step should always have delay_days: 0
- Follow-up emails after step 1 should use is_reply_to_previous: true when appropriate
- Keep emails short and actionable — under 150 words each
- Include a clear call to action in each email
- Vary the approach across steps (intro, value-add, social proof, urgency, breakup)

You MUST respond with valid JSON only, no markdown or extra text. Use this exact format:
{
  "name": "Campaign Name",
  "description": "Brief description of the campaign strategy",
  "reply_mode": "ai_draft_approve",
  "schedule": {
    "send_days": [1,2,3,4,5],
    "send_window_start": "09:00",
    "send_window_end": "17:00",
    "daily_send_limit": 50
  },
  "steps": [
    {
      "step_order": 1,
      "delay_days": 0,
      "subject_template": "Subject with {{first_name}}",
      "body_template": "<p>Email body HTML</p>",
      "is_reply_to_previous": false
    }
  ]
}`;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { brandId, brief, category, targetAudience } = body;

  if (!brandId || !brief) {
    return NextResponse.json({ error: 'brandId and brief are required' }, { status: 400 });
  }

  // Look up brand guardrails for context
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;

  // Build the user prompt with brand context
  let prompt = `Generate an email outreach campaign based on this brief:\n\n"${brief}"`;

  if (category) {
    prompt += `\n\nCampaign category: ${category}`;
  }

  if (targetAudience) {
    prompt += `\n\nTarget audience: ${targetAudience}`;
  }

  // Add brand context from guardrails
  const brandContext: string[] = [];
  if (brand.name) brandContext.push(`Company name: ${brand.name}`);
  if (guardrails.industry) brandContext.push(`Industry: ${guardrails.industry}`);
  if (guardrails.description) brandContext.push(`Description: ${guardrails.description}`);
  if (guardrails.target_audience) brandContext.push(`Target audience: ${guardrails.target_audience}`);
  if (guardrails.keywords)
    brandContext.push(
      `Keywords: ${Array.isArray(guardrails.keywords) ? (guardrails.keywords as string[]).join(', ') : guardrails.keywords}`,
    );

  if (brandContext.length > 0) {
    prompt += `\n\nBrand context:\n${brandContext.join('\n')}`;
  }

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text content from the response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Failed to generate campaign — no text in AI response' }, { status: 500 });
    }

    // Parse the JSON response
    let plan;
    try {
      plan = JSON.parse(textBlock.text);
    } catch {
      // Try to extract JSON from the response if it has surrounding text
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json({ error: 'Failed to parse AI response as JSON' }, { status: 500 });
      }
    }

    // Validate required fields
    if (!plan.name || !plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      return NextResponse.json({ error: 'AI response missing required fields (name, steps)' }, { status: 500 });
    }

    // Validate each step
    for (const step of plan.steps) {
      if (
        typeof step.step_order !== 'number' ||
        typeof step.delay_days !== 'number' ||
        !step.subject_template ||
        !step.body_template
      ) {
        return NextResponse.json({ error: 'AI response has invalid step structure' }, { status: 500 });
      }
    }

    // Ensure defaults
    plan.reply_mode = plan.reply_mode || 'ai_draft_approve';
    plan.schedule = plan.schedule || {};
    plan.schedule.send_days = plan.schedule.send_days || [1, 2, 3, 4, 5];
    plan.schedule.send_window_start = plan.schedule.send_window_start || '09:00';
    plan.schedule.send_window_end = plan.schedule.send_window_end || '17:00';
    plan.schedule.daily_send_limit = plan.schedule.daily_send_limit || 50;

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Campaign builder AI error:', error);
    return NextResponse.json({ error: 'Failed to generate campaign' }, { status: 500 });
  }
}
