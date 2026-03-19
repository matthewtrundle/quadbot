import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands, metricSnapshots, recommendations, actionDrafts, outreachEmails, signals } from '@quadbot/db';
import { and, gte, lte, desc, inArray } from 'drizzle-orm';

type TrendEntry = { date: string; [metricKey: string]: string | number };

export const dynamic = 'force-dynamic';

const VALID_PERIODS = [7, 14, 30, 60, 90];
const TREND_METRIC_KEYS = ['clicks', 'impressions', 'ctr', 'performance_score'];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);

  // Parse query params
  const { searchParams } = new URL(req.url);
  const brandIdsParam = searchParams.get('brandIds');
  const periodParam = searchParams.get('period');
  const period = VALID_PERIODS.includes(Number(periodParam)) ? Number(periodParam) : 30;

  // Date boundaries
  const now = new Date();
  const periodStart = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
  const previousPeriodStart = new Date(now.getTime() - period * 2 * 24 * 60 * 60 * 1000);

  // Resolve brand IDs
  let brandIds: string[];
  if (brandIdsParam) {
    brandIds = brandIdsParam.split(',').filter(Boolean);
    // Non-admin can only see their own brand
    if (!admin && userBrandId) {
      brandIds = brandIds.filter((id) => id === userBrandId);
    }
  } else if (!admin && userBrandId) {
    brandIds = [userBrandId];
  } else {
    // Admin with no filter: fetch all brand IDs
    const allBrands = await db.select({ id: brands.id }).from(brands);
    brandIds = allBrands.map((b) => b.id);
  }

  if (brandIds.length === 0) {
    return NextResponse.json({
      brands: [],
      metrics: {},
      recommendations: {},
      actions: {},
      outreach: {},
      signals: [],
      trendData: {},
    });
  }

  // Parallel data fetching
  const [brandsData, currentMetrics, previousMetrics, recsData, actionsData, outreachData, signalsData, trendRaw] =
    await Promise.all([
      // a) Brands
      db
        .select({
          id: brands.id,
          name: brands.name,
          mode: brands.mode,
          is_active: brands.is_active,
        })
        .from(brands)
        .where(inArray(brands.id, brandIds)),

      // b) Current period metrics
      db
        .select()
        .from(metricSnapshots)
        .where(and(inArray(metricSnapshots.brand_id, brandIds), gte(metricSnapshots.captured_at, periodStart)))
        .orderBy(desc(metricSnapshots.captured_at)),

      // b) Previous period metrics
      db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            inArray(metricSnapshots.brand_id, brandIds),
            gte(metricSnapshots.captured_at, previousPeriodStart),
            lte(metricSnapshots.captured_at, periodStart),
          ),
        )
        .orderBy(desc(metricSnapshots.captured_at)),

      // c) Recommendations
      db
        .select({
          brand_id: recommendations.brand_id,
          status: recommendations.status,
          confidence: recommendations.confidence,
          roi_score: recommendations.roi_score,
        })
        .from(recommendations)
        .where(and(inArray(recommendations.brand_id, brandIds), gte(recommendations.created_at, periodStart))),

      // d) Actions
      db
        .select({
          brand_id: actionDrafts.brand_id,
          status: actionDrafts.status,
        })
        .from(actionDrafts)
        .where(and(inArray(actionDrafts.brand_id, brandIds), gte(actionDrafts.created_at, periodStart))),

      // e) Outreach emails
      db
        .select({
          brand_id: outreachEmails.brand_id,
          status: outreachEmails.status,
          opened_at: outreachEmails.opened_at,
          clicked_at: outreachEmails.clicked_at,
        })
        .from(outreachEmails)
        .where(and(inArray(outreachEmails.brand_id, brandIds), gte(outreachEmails.created_at, periodStart))),

      // f) Active signals
      db
        .select({
          title: signals.title,
          confidence: signals.confidence,
          domain: signals.domain,
          created_at: signals.created_at,
        })
        .from(signals)
        .where(and(inArray(signals.source_brand_id, brandIds), gte(signals.expires_at, now)))
        .orderBy(desc(signals.confidence)),

      // g) Trend data - daily metric snapshots for key metrics
      db
        .select()
        .from(metricSnapshots)
        .where(
          and(
            inArray(metricSnapshots.brand_id, brandIds),
            gte(metricSnapshots.captured_at, periodStart),
            inArray(metricSnapshots.metric_key, TREND_METRIC_KEYS),
          ),
        )
        .orderBy(metricSnapshots.captured_at),
    ]);

  // Process metrics: latest value per brand per metric_key
  const metrics: Record<
    string,
    Record<
      string,
      {
        current: number;
        previous: number;
        delta: number;
        source: string;
      }
    >
  > = {};

  // Build current period: take latest value per brand+metric_key
  const currentLatest = new Map<string, (typeof currentMetrics)[0]>();
  for (const m of currentMetrics) {
    const key = `${m.brand_id}:${m.metric_key}`;
    if (!currentLatest.has(key)) {
      currentLatest.set(key, m); // Already sorted desc, first is latest
    }
  }

  // Build previous period: take latest value per brand+metric_key
  const previousLatest = new Map<string, (typeof previousMetrics)[0]>();
  for (const m of previousMetrics) {
    const key = `${m.brand_id}:${m.metric_key}`;
    if (!previousLatest.has(key)) {
      previousLatest.set(key, m);
    }
  }

  // Merge current + previous
  const allMetricKeys = new Set<string>();
  currentLatest.forEach((_, key) => allMetricKeys.add(key));
  previousLatest.forEach((_, key) => allMetricKeys.add(key));

  allMetricKeys.forEach((compositeKey) => {
    const [brandId, metricKey] = compositeKey.split(':');
    const cur = currentLatest.get(compositeKey);
    const prev = previousLatest.get(compositeKey);
    const currentVal = cur?.value ?? 0;
    const previousVal = prev?.value ?? 0;

    if (!metrics[brandId]) metrics[brandId] = {};
    metrics[brandId][metricKey] = {
      current: currentVal,
      previous: previousVal,
      delta: currentVal - previousVal,
      source: cur?.source ?? prev?.source ?? '',
    };
  });

  // Process recommendations per brand
  const recsResult: Record<
    string,
    {
      total: number;
      approved: number;
      rejected: number;
      pending: number;
      acceptanceRate: number;
      avgConfidence: number;
      avgRoiScore: number;
    }
  > = {};

  for (const brandId of brandIds) {
    const brandRecs = recsData.filter((r) => r.brand_id === brandId);
    const total = brandRecs.length;
    const approved = brandRecs.filter((r) => r.status === 'approved' || r.status === 'executed').length;
    const rejected = brandRecs.filter((r) => r.status === 'rejected' || r.status === 'dismissed').length;
    const pending = brandRecs.filter((r) => r.status === 'active').length;

    const confidences = brandRecs.filter((r) => r.confidence != null).map((r) => r.confidence!);
    const roiScores = brandRecs.filter((r) => r.roi_score != null).map((r) => r.roi_score!);

    recsResult[brandId] = {
      total,
      approved,
      rejected,
      pending,
      acceptanceRate: total > 0 ? approved / total : 0,
      avgConfidence: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      avgRoiScore: roiScores.length > 0 ? roiScores.reduce((a, b) => a + b, 0) / roiScores.length : 0,
    };
  }

  // Process actions per brand
  const actionsResult: Record<
    string,
    {
      total: number;
      executed: number;
      pending: number;
      executionRate: number;
    }
  > = {};

  for (const brandId of brandIds) {
    const brandActions = actionsData.filter((a) => a.brand_id === brandId);
    const total = brandActions.length;
    const executed = brandActions.filter((a) => a.status === 'executed' || a.status === 'executed_stub').length;
    const pending = brandActions.filter((a) => a.status === 'pending').length;

    actionsResult[brandId] = {
      total,
      executed,
      pending,
      executionRate: total > 0 ? executed / total : 0,
    };
  }

  // Process outreach per brand
  const outreachResult: Record<
    string,
    {
      totalSent: number;
      totalOpened: number;
      totalClicked: number;
      openRate: number;
      clickRate: number;
    }
  > = {};

  for (const brandId of brandIds) {
    const brandEmails = outreachData.filter((e) => e.brand_id === brandId);
    const totalSent = brandEmails.length;
    const totalOpened = brandEmails.filter((e) => e.opened_at != null).length;
    const totalClicked = brandEmails.filter((e) => e.clicked_at != null).length;

    outreachResult[brandId] = {
      totalSent,
      totalOpened,
      totalClicked,
      openRate: totalSent > 0 ? totalOpened / totalSent : 0,
      clickRate: totalSent > 0 ? totalClicked / totalSent : 0,
    };
  }

  // Process trend data: group by brand + date
  const trendData: Record<string, TrendEntry[]> = {};

  for (const brandId of brandIds) {
    const brandTrend = trendRaw.filter((t) => t.brand_id === brandId);
    const dateMap = new Map<string, TrendEntry>();

    for (const row of brandTrend) {
      const dateStr = row.captured_at.toISOString().split('T')[0];
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { date: dateStr });
      }
      const entry = dateMap.get(dateStr)!;
      entry[row.metric_key] = row.value;
    }

    trendData[brandId] = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  return NextResponse.json({
    brands: brandsData,
    metrics,
    recommendations: recsResult,
    actions: actionsResult,
    outreach: outreachResult,
    signals: signalsData,
    trendData,
  });
}
