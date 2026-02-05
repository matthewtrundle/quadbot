import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brands, recommendations, actionDrafts, evaluationRuns } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const allBrands = await db.select().from(brands);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const health = await Promise.all(
    allBrands.map(async (brand) => {
      const pending = await db
        .select({ id: actionDrafts.id })
        .from(actionDrafts)
        .where(and(eq(actionDrafts.brand_id, brand.id), eq(actionDrafts.status, 'pending')));

      const recentRecs = await db
        .select({ id: recommendations.id })
        .from(recommendations)
        .where(
          and(
            eq(recommendations.brand_id, brand.id),
            gte(recommendations.created_at, sevenDaysAgo),
          ),
        );

      const [latestEval] = await db
        .select()
        .from(evaluationRuns)
        .where(eq(evaluationRuns.brand_id, brand.id))
        .orderBy(desc(evaluationRuns.created_at))
        .limit(1);

      return {
        brand_id: brand.id,
        brand_name: brand.name,
        mode: brand.mode,
        pending_actions: pending.length,
        recent_recommendations: recentRecs.length,
        acceptance_rate: latestEval?.acceptance_rate,
        time_budget: brand.time_budget_minutes_per_day || 30,
      };
    }),
  );

  return NextResponse.json(health);
}
