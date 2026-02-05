import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recommendations, outcomes, actionDrafts, signals, brands } from '@quadbot/db';
import { desc, gte, eq, and } from 'drizzle-orm';

export async function GET() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [wins, regressions, newRisks, pendingApprovals, newSignals] = await Promise.all([
    // Biggest wins: outcomes with largest positive delta since yesterday
    db
      .select({
        id: outcomes.id,
        metric_name: outcomes.metric_name,
        delta: outcomes.delta,
        rec_title: recommendations.title,
        brand_name: brands.name,
      })
      .from(outcomes)
      .innerJoin(recommendations, eq(outcomes.recommendation_id, recommendations.id))
      .innerJoin(brands, eq(recommendations.brand_id, brands.id))
      .where(gte(outcomes.measured_at, yesterday))
      .orderBy(desc(outcomes.delta))
      .limit(5),

    // Biggest regressions: outcomes with largest negative delta
    db
      .select({
        id: outcomes.id,
        metric_name: outcomes.metric_name,
        delta: outcomes.delta,
        rec_title: recommendations.title,
        brand_name: brands.name,
      })
      .from(outcomes)
      .innerJoin(recommendations, eq(outcomes.recommendation_id, recommendations.id))
      .innerJoin(brands, eq(recommendations.brand_id, brands.id))
      .where(gte(outcomes.measured_at, yesterday))
      .orderBy(outcomes.delta)
      .limit(5),

    // New high-priority recommendations
    db
      .select({
        id: recommendations.id,
        title: recommendations.title,
        priority: recommendations.priority,
        source: recommendations.source,
        brand_name: brands.name,
      })
      .from(recommendations)
      .innerJoin(brands, eq(recommendations.brand_id, brands.id))
      .where(
        and(
          gte(recommendations.created_at, yesterday),
          eq(recommendations.priority, 'high'),
        ),
      )
      .orderBy(desc(recommendations.created_at))
      .limit(10),

    // Pending approvals
    db
      .select({
        id: actionDrafts.id,
        type: actionDrafts.type,
        risk: actionDrafts.risk,
        brand_name: brands.name,
        rec_title: recommendations.title,
      })
      .from(actionDrafts)
      .innerJoin(recommendations, eq(actionDrafts.recommendation_id, recommendations.id))
      .innerJoin(brands, eq(recommendations.brand_id, brands.id))
      .where(eq(actionDrafts.status, 'pending'))
      .orderBy(desc(actionDrafts.created_at))
      .limit(10),

    // New signals discovered
    db
      .select()
      .from(signals)
      .where(gte(signals.created_at, yesterday))
      .orderBy(desc(signals.created_at))
      .limit(5),
  ]);

  return NextResponse.json({
    wins,
    regressions: regressions.filter((r) => r.delta != null && r.delta < 0),
    newRisks,
    pendingApprovals,
    newSignals,
  });
}
