import { brands, brandIntegrations, metricSnapshots, recommendations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

const PAGESPEED_API_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const RATE_LIMIT_DELAY_MS = 2000;

type CwvMetrics = {
  performance_score: number;
  lcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  fcp_ms: number | null;
  speed_index_ms: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageSpeedMetrics(url: string): Promise<CwvMetrics> {
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
  });

  const apiKey = process.env.PAGESPEED_API_KEY;
  if (apiKey) {
    params.set('key', apiKey);
  }

  const response = await fetch(`${PAGESPEED_API_BASE}?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PageSpeed API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const lighthouseResult = data.lighthouseResult as Record<string, unknown> | undefined;

  if (!lighthouseResult) {
    throw new Error('No lighthouseResult in PageSpeed response');
  }

  const categories = lighthouseResult.categories as Record<string, unknown> | undefined;
  const performanceCat = categories?.performance as Record<string, unknown> | undefined;
  const performanceScore = typeof performanceCat?.score === 'number' ? performanceCat.score * 100 : 0;

  const audits = lighthouseResult.audits as Record<string, Record<string, unknown>> | undefined;

  const getNumericValue = (auditId: string): number | null => {
    const audit = audits?.[auditId];
    return typeof audit?.numericValue === 'number' ? audit.numericValue : null;
  };

  return {
    performance_score: Math.round(performanceScore),
    lcp_ms: getNumericValue('largest-contentful-paint'),
    cls: (audits?.['cumulative-layout-shift']?.numericValue as number | null) ?? null,
    tbt_ms: getNumericValue('total-blocking-time'),
    fcp_ms: getNumericValue('first-contentful-paint'),
    speed_index_ms: getNumericValue('speed-index'),
  };
}

/**
 * PageSpeed / Core Web Vitals Monitor
 * Fetches Google PageSpeed Insights (free API) for the brand's site,
 * stores metric snapshots, and creates recommendations for poor scores.
 */
export async function pagespeedMonitor(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId, payload } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'pagespeed_monitor' }, 'PageSpeed_Monitor starting');

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // Get site URL from GSC integration config
  const [integration] = await db
    .select({ config: brandIntegrations.config })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'google_search_console')))
    .limit(1);

  const integrationConfig = integration?.config as Record<string, unknown> | undefined;
  const siteUrl = (integrationConfig?.siteUrl as string) || (integrationConfig?.site_url as string) || null;

  if (!siteUrl) {
    logger.info({ jobId, brandId }, 'No site URL configured (GSC integration), skipping PageSpeed check');
    return;
  }

  // Normalize site URL to a proper page URL
  let homepageUrl = siteUrl;
  if (homepageUrl.startsWith('sc-domain:')) {
    homepageUrl = `https://${homepageUrl.replace('sc-domain:', '')}`;
  }
  if (!homepageUrl.startsWith('http')) {
    homepageUrl = `https://${homepageUrl}`;
  }

  // Build list of pages to check
  const pagesToCheck: string[] = [homepageUrl];
  const extraPages = (payload?.extra_pages as string[]) || [];
  for (const page of extraPages) {
    if (!pagesToCheck.includes(page)) {
      pagesToCheck.push(page);
    }
  }

  const capturedAt = new Date();
  let totalMetrics = 0;
  let poorPages = 0;

  for (let i = 0; i < pagesToCheck.length; i++) {
    const pageUrl = pagesToCheck[i];

    if (i > 0) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    let metrics: CwvMetrics;
    try {
      metrics = await fetchPageSpeedMetrics(pageUrl);
    } catch (err) {
      logger.warn({ jobId, brandId, pageUrl, err: (err as Error).message }, 'Failed to fetch PageSpeed for page');
      continue;
    }

    logger.info({ jobId, brandId, pageUrl, performanceScore: metrics.performance_score }, 'PageSpeed metrics fetched');

    // Store each metric as a metric_snapshot
    const metricEntries: Array<{ key: string; value: number | null }> = [
      { key: 'performance_score', value: metrics.performance_score },
      { key: 'lcp_ms', value: metrics.lcp_ms },
      { key: 'cls', value: metrics.cls },
      { key: 'tbt_ms', value: metrics.tbt_ms },
      { key: 'fcp_ms', value: metrics.fcp_ms },
      { key: 'speed_index_ms', value: metrics.speed_index_ms },
    ];

    for (const entry of metricEntries) {
      if (entry.value === null) continue;

      await db.insert(metricSnapshots).values({
        brand_id: brandId,
        source: 'pagespeed',
        metric_key: entry.key,
        value: entry.value,
        dimensions: { page_url: pageUrl, strategy: 'mobile' },
        captured_at: capturedAt,
      });
      totalMetrics++;
    }

    // Create recommendation for poor performance scores
    if (metrics.performance_score < 50) {
      poorPages++;

      const issues: string[] = [];
      if (metrics.lcp_ms && metrics.lcp_ms > 4000)
        issues.push(`LCP: ${(metrics.lcp_ms / 1000).toFixed(1)}s (should be <2.5s)`);
      if (metrics.cls && metrics.cls > 0.25) issues.push(`CLS: ${metrics.cls.toFixed(3)} (should be <0.1)`);
      if (metrics.tbt_ms && metrics.tbt_ms > 600) issues.push(`TBT: ${metrics.tbt_ms.toFixed(0)}ms (should be <200ms)`);
      if (metrics.fcp_ms && metrics.fcp_ms > 3000)
        issues.push(`FCP: ${(metrics.fcp_ms / 1000).toFixed(1)}s (should be <1.8s)`);

      const priority = metrics.performance_score < 25 ? 'critical' : 'high';

      const [rec] = await db
        .insert(recommendations)
        .values({
          brand_id: brandId,
          job_id: jobId,
          source: 'pagespeed_monitor',
          priority,
          title: `Poor PageSpeed score (${metrics.performance_score}/100): ${pageUrl}`,
          body: `**Performance Score:** ${metrics.performance_score}/100 (mobile)\n\n**Core Web Vitals Issues:**\n${issues.length > 0 ? issues.map((i) => `- ${i}`).join('\n') : '- Overall score is below threshold'}\n\n**Recommendations:**\n- Optimize images (use WebP/AVIF, lazy loading)\n- Minimize render-blocking resources\n- Reduce JavaScript bundle size\n- Implement proper caching headers\n- Consider using a CDN`,
          data: {
            page_url: pageUrl,
            ...metrics,
          },
        })
        .returning();

      await emitEvent(
        EventType.RECOMMENDATION_CREATED,
        brandId,
        { recommendation_id: rec.id, source: 'pagespeed_monitor', priority },
        `rec:${rec.id}`,
        'pagespeed_monitor',
      );
    }
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'pagespeed_monitor',
      pagesChecked: pagesToCheck.length,
      totalMetrics,
      poorPages,
      durationMs: Date.now() - startTime,
    },
    'PageSpeed_Monitor completed',
  );
}
