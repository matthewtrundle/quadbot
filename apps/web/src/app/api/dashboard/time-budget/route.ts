import { NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands, actionDrafts } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);

  const allBrands = !admin && userBrandId
    ? await db.select().from(brands).where(eq(brands.id, userBrandId))
    : await db.select().from(brands);

  const budgets = await Promise.all(
    allBrands.map(async (brand) => {
      const pending = await db
        .select({ id: actionDrafts.id })
        .from(actionDrafts)
        .where(and(eq(actionDrafts.brand_id, brand.id), eq(actionDrafts.status, 'pending')));

      const timeBudget = brand.time_budget_minutes_per_day || 30;
      const estimatedMinutes = pending.length * 10;

      return {
        brand_id: brand.id,
        brand_name: brand.name,
        time_budget: timeBudget,
        estimated_used: estimatedMinutes,
        pending_actions: pending.length,
        percentage: timeBudget > 0 ? Math.min(100, (estimatedMinutes / timeBudget) * 100) : 0,
      };
    }),
  );

  const totalBudget = budgets.reduce((sum, b) => sum + b.time_budget, 0);
  const totalUsed = budgets.reduce((sum, b) => sum + b.estimated_used, 0);

  return NextResponse.json({
    brands: budgets,
    total_budget: totalBudget,
    total_used: totalUsed,
    total_percentage: totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0,
  });
}
