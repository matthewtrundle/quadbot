import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { recommendations, brands, actionDrafts, signals } from '@quadbot/db';
import { desc, eq, isNotNull, gte, and } from 'drizzle-orm';
import { PriorityQueue } from '@/components/priority-queue';
import { BrandHealthGrid } from '@/components/brand-health-grid';
import { SignalFeed } from '@/components/signal-feed';
import { TimeBudgetBar } from '@/components/time-budget-bar';
import { getSession, isAdmin } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);

  const brandFilter = !admin && userBrandId
    ? eq(recommendations.brand_id, userBrandId)
    : undefined;

  // Get top 20 ranked recommendations
  const priorityRecs = await db
    .select({
      id: recommendations.id,
      brand_id: recommendations.brand_id,
      brand_name: brands.name,
      title: recommendations.title,
      source: recommendations.source,
      priority: recommendations.priority,
      priority_rank: recommendations.priority_rank,
      base_score: recommendations.base_score,
      roi_score: recommendations.roi_score,
      effort_estimate: recommendations.effort_estimate,
      confidence: recommendations.confidence,
      created_at: recommendations.created_at,
    })
    .from(recommendations)
    .innerJoin(brands, eq(recommendations.brand_id, brands.id))
    .where(and(isNotNull(recommendations.priority_rank), eq(recommendations.status, 'active'), brandFilter))
    .orderBy(recommendations.priority_rank)
    .limit(20);

  // Get brands for health grid
  const allBrands = admin
    ? await db.select().from(brands)
    : userBrandId
      ? await db.select().from(brands).where(eq(brands.id, userBrandId))
      : [];

  // Get brand-level stats
  const brandStats = await Promise.all(
    allBrands.map(async (brand) => {
      const pendingActions = await db
        .select({ id: actionDrafts.id })
        .from(actionDrafts)
        .where(and(eq(actionDrafts.brand_id, brand.id), eq(actionDrafts.status, 'pending')));

      const recentRecs = await db
        .select({ id: recommendations.id })
        .from(recommendations)
        .where(
          and(
            eq(recommendations.brand_id, brand.id),
            gte(recommendations.created_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
          ),
        );

      return {
        brand_id: brand.id,
        brand_name: brand.name,
        mode: brand.mode,
        pending_actions: pendingActions.length,
        recent_recommendations: recentRecs.length,
        time_budget: brand.time_budget_minutes_per_day || 30,
      };
    }),
  );

  // Get recent signals
  const recentSignals = await db
    .select()
    .from(signals)
    .orderBy(desc(signals.created_at))
    .limit(10);

  return (
    <div className="space-y-6">
      <TimeBudgetBar brands={brandStats} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PriorityQueue recommendations={priorityRecs} />
        </div>
        <div className="space-y-6">
          <BrandHealthGrid brands={brandStats} />
          <SignalFeed signals={recentSignals} />
        </div>
      </div>
    </div>
  );
}
