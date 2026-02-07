import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobs, actionDrafts, recommendations } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');

  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 });
  }

  const jobList = await db
    .select()
    .from(jobs)
    .where(eq(jobs.brand_id, brandId))
    .orderBy(desc(jobs.created_at))
    .limit(20);

  const actions = await db
    .select()
    .from(actionDrafts)
    .where(eq(actionDrafts.brand_id, brandId))
    .orderBy(desc(actionDrafts.created_at))
    .limit(20);

  const recs = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.brand_id, brandId))
    .orderBy(desc(recommendations.created_at))
    .limit(20);

  return NextResponse.json({
    brandId,
    jobs: jobList.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.error,
      attempts: j.attempts,
      created_at: j.created_at,
    })),
    actionDrafts: actions.map((a) => ({
      id: a.id,
      action_type: a.action_type,
      status: a.status,
      created_at: a.created_at,
    })),
    recommendations: recs.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      created_at: r.created_at,
    })),
  });
}
