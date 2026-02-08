import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executionRules } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { getSession, isAdmin } from '@/lib/auth-session';
import { z } from 'zod';

const executionRulesSchema = z.object({
  auto_execute: z.boolean(),
  min_confidence: z.number().min(0.5).max(1),
  max_risk: z.enum(['low', 'medium', 'high']),
  allowed_action_types: z.array(z.string()).optional().default([]),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const userBrandId = (session.user as any).brandId;
  const admin = isAdmin(session);
  if (!admin && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [rules] = await db
    .select()
    .from(executionRules)
    .where(eq(executionRules.brand_id, brandId))
    .limit(1);

  return NextResponse.json(rules ?? {
    auto_execute: false,
    min_confidence: 0.9,
    max_risk: 'low',
    allowed_action_types: [],
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: brandId } = await params;
  const userBrandId = (session.user as any).brandId;
  const admin = isAdmin(session);
  if (!admin && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = executionRulesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Upsert: check if rules exist
  const [existing] = await db
    .select({ id: executionRules.id })
    .from(executionRules)
    .where(eq(executionRules.brand_id, brandId))
    .limit(1);

  let result;
  if (existing) {
    [result] = await db
      .update(executionRules)
      .set({
        auto_execute: parsed.data.auto_execute,
        min_confidence: parsed.data.min_confidence,
        max_risk: parsed.data.max_risk,
        allowed_action_types: parsed.data.allowed_action_types,
        updated_at: new Date(),
      })
      .where(eq(executionRules.id, existing.id))
      .returning();
  } else {
    [result] = await db
      .insert(executionRules)
      .values({
        brand_id: brandId,
        auto_execute: parsed.data.auto_execute,
        min_confidence: parsed.data.min_confidence,
        max_risk: parsed.data.max_risk,
        allowed_action_types: parsed.data.allowed_action_types,
      })
      .returning();
  }

  return NextResponse.json(result);
}
