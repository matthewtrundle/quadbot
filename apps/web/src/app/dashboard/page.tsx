import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { recommendations, brands, actionDrafts, signals } from '@quadbot/db';
import { desc, eq, isNotNull, gte, and, sql, count } from 'drizzle-orm';
import { PriorityQueue } from '@/components/priority-queue';
import { BrandHealthGrid } from '@/components/brand-health-grid';
import { SignalFeed } from '@/components/signal-feed';
import { TimeBudgetBar } from '@/components/time-budget-bar';
import { DashboardCharts } from '@/components/dashboard-charts';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);

  const brandFilter = !admin && userBrandId ? eq(recommendations.brand_id, userBrandId) : undefined;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Run all independent queries in parallel
  const [priorityRecs, allBrands, pendingActionCounts, recentRecCounts, recentSignals, chartRecs] = await Promise.all([
    // Top 20 ranked recommendations
    db
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
      .limit(20),

    // All brands
    admin
      ? db.select().from(brands)
      : userBrandId
        ? db.select().from(brands).where(eq(brands.id, userBrandId))
        : Promise.resolve([]),

    // Pending action counts per brand (single query instead of N+1)
    db
      .select({ brand_id: actionDrafts.brand_id, count: count() })
      .from(actionDrafts)
      .where(eq(actionDrafts.status, 'pending'))
      .groupBy(actionDrafts.brand_id),

    // Recent recommendation counts per brand (single query instead of N+1)
    db
      .select({ brand_id: recommendations.brand_id, count: count() })
      .from(recommendations)
      .where(gte(recommendations.created_at, sevenDaysAgo))
      .groupBy(recommendations.brand_id),

    // Recent signals
    db.select().from(signals).orderBy(desc(signals.created_at)).limit(10),

    // Chart data (last 30 days)
    db
      .select({
        priority: recommendations.priority,
        source: recommendations.source,
        created_at: recommendations.created_at,
      })
      .from(recommendations)
      .where(and(gte(recommendations.created_at, thirtyDaysAgo), brandFilter))
      .orderBy(desc(recommendations.created_at)),
  ]);

  // Build brand stats from aggregated queries (no N+1)
  const pendingMap = new Map(pendingActionCounts.map((r) => [r.brand_id, Number(r.count)]));
  const recentMap = new Map(recentRecCounts.map((r) => [r.brand_id, Number(r.count)]));

  const brandStats = allBrands.map((brand) => ({
    brand_id: brand.id,
    brand_name: brand.name,
    mode: brand.mode,
    is_active: brand.is_active,
    pending_actions: pendingMap.get(brand.id) ?? 0,
    recent_recommendations: recentMap.get(brand.id) ?? 0,
    time_budget: brand.time_budget_minutes_per_day || 30,
  }));

  const firstName = session.user.name?.split(' ')[0];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold">Welcome back{firstName ? `, ${firstName}` : ''}</h1>
        <p className="mt-1 text-muted-foreground">Here&apos;s what QuadBot has been working on for you.</p>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <TimeBudgetBar brands={brandStats} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <PriorityQueue recommendations={priorityRecs} />
        </div>
        <div className="space-y-6">
          <div className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <BrandHealthGrid brands={brandStats} />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '400ms' }}>
            <SignalFeed signals={recentSignals} />
          </div>
        </div>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: '500ms' }}>
        <DashboardCharts recommendations={chartRecs} />
      </div>
    </div>
  );
}
