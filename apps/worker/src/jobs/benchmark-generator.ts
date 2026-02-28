import { brands, metricSnapshots, recommendations } from '@quadbot/db';
import { eq, and, gte, desc, sql, ne } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';

/**
 * Phase 7D: Cross-Brand Benchmark Generator
 *
 * Aggregates metric_snapshots across brands in the same industry/vertical
 * to produce anonymous benchmark comparisons:
 * - "Your average CTR (2.3%) is below the median for SaaS brands (3.1%)"
 * - "Your ad ROAS (3.2x) is in the top 25% of e-commerce brands"
 *
 * Privacy: Only aggregate stats, never individual brand data.
 * Stores benchmarks as metric_snapshots (source: 'benchmark') and creates
 * recommendations when significant gaps are found.
 */

type BenchmarkMetric = {
  metric_key: string;
  source: string;
  brand_value: number;
  median: number;
  p25: number;
  p75: number;
  percentile_rank: number; // Where this brand falls (0-100)
  sample_size: number;
};

const BENCHMARK_METRICS = [
  { source: 'gsc', key: 'ctr', label: 'CTR', format: 'pct', higher_is_better: true },
  { source: 'gsc', key: 'position', label: 'Avg Position', format: 'num', higher_is_better: false },
  { source: 'gsc', key: 'clicks', label: 'Clicks', format: 'num', higher_is_better: true },
  { source: 'gsc', key: 'impressions', label: 'Impressions', format: 'num', higher_is_better: true },
  { source: 'ads', key: 'roas', label: 'ROAS', format: 'num', higher_is_better: true },
  { source: 'ads', key: 'cpc', label: 'CPC', format: 'currency', higher_is_better: false },
  { source: 'ads', key: 'conversion_rate', label: 'Conversion Rate', format: 'pct', higher_is_better: true },
  { source: 'ga4', key: 'bounce_rate', label: 'Bounce Rate', format: 'pct', higher_is_better: false },
  { source: 'ga4', key: 'session_duration', label: 'Session Duration', format: 'num', higher_is_better: true },
];

const MIN_BRANDS_FOR_BENCHMARK = 3; // Need at least 3 brands to produce meaningful benchmarks

export async function benchmarkGenerator(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'benchmark_generator' }, 'Benchmark_Generator starting');

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;
  const industry = guardrails.industry as string | undefined;

  if (!industry) {
    logger.info({ jobId, brandId }, 'Brand has no industry set, skipping benchmark generation');
    return;
  }

  // Find other active brands in the same industry
  const allBrands = await db
    .select({ id: brands.id, guardrails: brands.guardrails })
    .from(brands)
    .where(eq(brands.is_active, true));

  const sameIndustryBrandIds = allBrands
    .filter((b) => {
      const g = (b.guardrails || {}) as Record<string, unknown>;
      return g.industry === industry;
    })
    .map((b) => b.id);

  if (sameIndustryBrandIds.length < MIN_BRANDS_FOR_BENCHMARK) {
    logger.info({
      jobId, brandId, industry,
      brandsInIndustry: sameIndustryBrandIds.length,
    }, 'Not enough brands in same industry for benchmarking');
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get recent metric snapshots for all brands in same industry
  const allSnapshots = await db
    .select({
      brand_id: metricSnapshots.brand_id,
      source: metricSnapshots.source,
      metric_key: metricSnapshots.metric_key,
      value: metricSnapshots.value,
    })
    .from(metricSnapshots)
    .where(gte(metricSnapshots.captured_at, thirtyDaysAgo));

  // Filter to same-industry brands and group by metric
  const industrySet = new Set(sameIndustryBrandIds);
  const metricGroups = new Map<string, Map<string, number[]>>(); // metric_key -> brand_id -> values[]

  for (const snap of allSnapshots) {
    if (!industrySet.has(snap.brand_id)) continue;

    const groupKey = `${snap.source}:${snap.metric_key}`;
    if (!metricGroups.has(groupKey)) metricGroups.set(groupKey, new Map());
    const brandMap = metricGroups.get(groupKey)!;
    if (!brandMap.has(snap.brand_id)) brandMap.set(snap.brand_id, []);
    brandMap.get(snap.brand_id)!.push(snap.value);
  }

  const benchmarks: BenchmarkMetric[] = [];

  for (const metricDef of BENCHMARK_METRICS) {
    const groupKey = `${metricDef.source}:${metricDef.key}`;
    const brandMap = metricGroups.get(groupKey);
    if (!brandMap || brandMap.size < MIN_BRANDS_FOR_BENCHMARK) continue;

    // Compute average per brand
    const brandAverages: { brandId: string; avg: number }[] = [];
    for (const [bid, values] of brandMap) {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      brandAverages.push({ brandId: bid, avg });
    }

    // Sort by value
    brandAverages.sort((a, b) => a.avg - b.avg);

    // Get this brand's value
    const thisBrandEntry = brandAverages.find((ba) => ba.brandId === brandId);
    if (!thisBrandEntry) continue; // This brand has no data for this metric

    const allValues = brandAverages.map((ba) => ba.avg);
    const median = computePercentile(allValues, 50);
    const p25 = computePercentile(allValues, 25);
    const p75 = computePercentile(allValues, 75);

    // Compute percentile rank for this brand
    const rank = brandAverages.findIndex((ba) => ba.brandId === brandId);
    const percentileRank = ((rank + 1) / brandAverages.length) * 100;

    benchmarks.push({
      metric_key: metricDef.key,
      source: metricDef.source,
      brand_value: Math.round(thisBrandEntry.avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      p25: Math.round(p25 * 100) / 100,
      p75: Math.round(p75 * 100) / 100,
      percentile_rank: Math.round(percentileRank),
      sample_size: brandAverages.length,
    });
  }

  if (benchmarks.length === 0) {
    logger.info({ jobId, brandId, industry }, 'No benchmark metrics available');
    return;
  }

  // Store benchmark results as metric snapshots
  for (const bm of benchmarks) {
    await db.insert(metricSnapshots).values({
      brand_id: brandId,
      source: 'benchmark',
      metric_key: `${bm.source}_${bm.metric_key}_percentile`,
      value: bm.percentile_rank,
      captured_at: new Date(),
    });

    await db.insert(metricSnapshots).values({
      brand_id: brandId,
      source: 'benchmark',
      metric_key: `${bm.source}_${bm.metric_key}_median`,
      value: bm.median,
      captured_at: new Date(),
    });
  }

  // Create recommendations for significant benchmark gaps
  let recsCreated = 0;
  for (const bm of benchmarks) {
    const metricDef = BENCHMARK_METRICS.find((m) => m.key === bm.metric_key && m.source === bm.source);
    if (!metricDef) continue;

    // Flag if below 25th percentile (for higher_is_better metrics)
    // or above 75th percentile (for lower_is_better metrics)
    const isUnderperforming = metricDef.higher_is_better
      ? bm.percentile_rank <= 25
      : bm.percentile_rank >= 75;

    const isOutperforming = metricDef.higher_is_better
      ? bm.percentile_rank >= 75
      : bm.percentile_rank <= 25;

    if (!isUnderperforming && !isOutperforming) continue;

    const formatValue = (v: number) => {
      if (metricDef.format === 'pct') return `${(v * 100).toFixed(1)}%`;
      if (metricDef.format === 'currency') return `$${v.toFixed(2)}`;
      return v.toFixed(1);
    };

    if (isUnderperforming) {
      const title = `Benchmark alert: ${metricDef.label} below industry median`;
      const body = `**${metricDef.source.toUpperCase()}** metric **${metricDef.label}** is underperforming compared to ${industry} peers.

**What the data shows:** Your ${metricDef.label} is ${formatValue(bm.brand_value)}, while the industry median is ${formatValue(bm.median)} (based on ${bm.sample_size} brands). You're at the ${bm.percentile_rank}th percentile.

**Why it matters:** Being below the 25th percentile suggests there may be optimization opportunities your competitors have already captured.

**What to do:**
1. Review recent changes to your ${metricDef.source.toUpperCase()} strategy
2. Analyze top-performing competitors for patterns
3. Consider QuadBot's specific recommendations for this metric`;

      await db.insert(recommendations).values({
        brand_id: brandId,
        job_id: jobId,
        source: 'benchmark_generator',
        priority: 'medium',
        title,
        body,
        data: {
          rec_type: 'benchmark_gap',
          metric_key: bm.metric_key,
          metric_source: bm.source,
          brand_value: bm.brand_value,
          median: bm.median,
          percentile_rank: bm.percentile_rank,
          sample_size: bm.sample_size,
          industry,
        },
      });
      recsCreated++;
    }

    if (isOutperforming) {
      const title = `Benchmark strength: ${metricDef.label} above industry peers`;
      const body = `**${metricDef.source.toUpperCase()}** metric **${metricDef.label}** is outperforming compared to ${industry} peers.

**What the data shows:** Your ${metricDef.label} is ${formatValue(bm.brand_value)}, well above the industry median of ${formatValue(bm.median)} (based on ${bm.sample_size} brands). You're at the ${bm.percentile_rank}th percentile.

**Why it matters:** This represents a competitive advantage worth protecting and building on.

**What to do:**
1. Document what's working well for this metric
2. Consider increasing investment in this area
3. Look for ways to apply similar strategies to underperforming metrics`;

      await db.insert(recommendations).values({
        brand_id: brandId,
        job_id: jobId,
        source: 'benchmark_generator',
        priority: 'low',
        title,
        body,
        data: {
          rec_type: 'benchmark_strength',
          metric_key: bm.metric_key,
          metric_source: bm.source,
          brand_value: bm.brand_value,
          median: bm.median,
          percentile_rank: bm.percentile_rank,
          sample_size: bm.sample_size,
          industry,
        },
      });
      recsCreated++;
    }
  }

  logger.info({
    jobId, brandId, jobType: 'benchmark_generator', industry,
    benchmarks: benchmarks.length,
    recsCreated,
    brandsInIndustry: sameIndustryBrandIds.length,
    durationMs: Date.now() - startTime,
  }, 'Benchmark_Generator completed');
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);

  if (lower === upper) return sorted[lower];

  const frac = idx - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}
