import { brands, competitorSnapshots, recommendations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import { z } from 'zod';
import { scrapePage, fetchSitemap, checkRobotsTxt, type ScrapedPage } from '../lib/web-scraper.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type ChangeReport = {
  domain: string;
  new_pages: ScrapedPage[];
  changed_pages: Array<{
    current: ScrapedPage;
    previous_hash: string;
  }>;
  removed_urls: string[];
};

// ─── Claude Output Schema ───────────────────────────────────────────────────

const competitorAnalysisSchema = z.object({
  summary: z.string(),
  insights: z.array(
    z.object({
      domain: z.string(),
      finding: z.string(),
      impact: z.enum(['low', 'medium', 'high']),
      recommended_action: z.string(),
    }),
  ),
  recommendations: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(['low', 'medium', 'high', 'critical']),
      category: z.string(),
    }),
  ),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Detect changes between current scraped pages and previous snapshots.
 */
export function detectChanges(
  currentPages: ScrapedPage[],
  previousSnapshots: Array<{ page_url: string; content_hash: string | null }>,
): {
  newPages: ScrapedPage[];
  changedPages: Array<{ current: ScrapedPage; previous_hash: string }>;
  removedUrls: string[];
} {
  const previousByUrl = new Map(previousSnapshots.map((s) => [s.page_url, s.content_hash]));
  const currentUrls = new Set(currentPages.map((p) => p.url));

  const newPages: ScrapedPage[] = [];
  const changedPages: Array<{ current: ScrapedPage; previous_hash: string }> = [];

  for (const page of currentPages) {
    const prevHash = previousByUrl.get(page.url);
    if (prevHash === undefined) {
      newPages.push(page);
    } else if (prevHash !== null && prevHash !== page.content_hash) {
      changedPages.push({ current: page, previous_hash: prevHash });
    }
  }

  const removedUrls = previousSnapshots.filter((s) => !currentUrls.has(s.page_url)).map((s) => s.page_url);

  return { newPages, changedPages, removedUrls };
}

/**
 * Delay helper for politeness between requests.
 */
async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Extract domain from a full URL.
 */
function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ─── Main Job ───────────────────────────────────────────────────────────────

/**
 * Competitor Monitor Job
 *
 * Monitors competitor websites for changes by:
 * 1. Discovering pages via sitemap
 * 2. Scraping allowed pages (respecting robots.txt)
 * 3. Comparing against previous snapshots
 * 4. Generating insights via Claude
 *
 * Triggered: Weekly (configured in cron.ts)
 */
export async function competitorMonitor(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'competitor_monitor' }, 'Competitor_Monitor starting');

  // 1. Load brand and check module enablement
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('competitor_monitor')) {
    logger.info({ jobId, brandId }, 'competitor_monitor module not enabled, skipping');
    return;
  }

  // 2. Read competitor domains from guardrails
  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;
  const competitors = (guardrails.competitors as string[]) || [];

  if (competitors.length === 0) {
    logger.info({ jobId, brandId }, 'No competitor domains configured, skipping');
    return;
  }

  logger.info({ jobId, brandId, competitorCount: competitors.length }, 'Processing competitors');

  // 3. Process each competitor domain
  const allChangeReports: ChangeReport[] = [];

  for (const domain of competitors) {
    try {
      logger.info({ jobId, brandId, domain }, 'Processing competitor domain');

      // 3a. Fetch sitemap to discover pages
      const sitemapUrls = await fetchSitemap(domain);
      logger.info({ jobId, domain, urlsFound: sitemapUrls.length }, 'Sitemap fetched');

      // 3b. Take top 10 pages
      const targetUrls = sitemapUrls.length > 0 ? sitemapUrls.slice(0, 10) : [`https://${domain}/`]; // Fallback: scrape homepage

      // 3c & 3d. Check robots.txt and scrape allowed pages
      const scrapedPages: ScrapedPage[] = [];

      for (const url of targetUrls) {
        try {
          const urlPath = new URL(url).pathname;
          const urlDomain = getDomainFromUrl(url);
          const allowed = await checkRobotsTxt(urlDomain, urlPath);

          if (!allowed) {
            logger.debug({ jobId, domain, url }, 'Blocked by robots.txt, skipping');
            continue;
          }

          const page = await scrapePage(url);
          scrapedPages.push(page);
          logger.debug({ jobId, domain, url, wordCount: page.word_count }, 'Page scraped');

          // Politeness delay: 2 seconds between requests
          await delay(2000);
        } catch (err) {
          logger.warn({ jobId, domain, url, err: (err as Error).message }, 'Failed to scrape page');
        }
      }

      if (scrapedPages.length === 0) {
        logger.info({ jobId, domain }, 'No pages scraped for competitor');
        continue;
      }

      // 3e. Load previous snapshots for comparison
      const previousSnapshots = await db
        .select({
          page_url: competitorSnapshots.page_url,
          content_hash: competitorSnapshots.content_hash,
        })
        .from(competitorSnapshots)
        .where(and(eq(competitorSnapshots.brand_id, brandId), eq(competitorSnapshots.competitor_domain, domain)));

      // 4. Detect changes
      const changes = detectChanges(scrapedPages, previousSnapshots);

      // Store current snapshots
      for (const page of scrapedPages) {
        await db.insert(competitorSnapshots).values({
          brand_id: brandId,
          competitor_domain: domain,
          page_url: page.url,
          title: page.title,
          meta_description: page.meta_description,
          content_hash: page.content_hash,
          word_count: page.word_count,
          headings: page.headings as Record<string, unknown>,
          schema_types: page.schema_types,
        });
      }

      // Build change report
      const hasChanges =
        changes.newPages.length > 0 || changes.changedPages.length > 0 || changes.removedUrls.length > 0;

      if (hasChanges) {
        allChangeReports.push({
          domain,
          new_pages: changes.newPages,
          changed_pages: changes.changedPages,
          removed_urls: changes.removedUrls,
        });
      }

      logger.info(
        {
          jobId,
          domain,
          scraped: scrapedPages.length,
          newPages: changes.newPages.length,
          changedPages: changes.changedPages.length,
          removedUrls: changes.removedUrls.length,
        },
        'Competitor domain processed',
      );
    } catch (err) {
      logger.error({ jobId, brandId, domain, err: (err as Error).message }, 'Failed to process competitor domain');
    }
  }

  // 5. If meaningful changes found, analyze with Claude
  if (allChangeReports.length > 0) {
    await analyzeChanges(ctx, brand.name, allChangeReports);
  } else {
    logger.info({ jobId, brandId }, 'No meaningful competitor changes detected');
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'competitor_monitor',
      competitorsProcessed: competitors.length,
      changeReports: allChangeReports.length,
      durationMs: Date.now() - startTime,
    },
    'Competitor_Monitor completed',
  );
}

/**
 * Use Claude to analyze competitor changes and generate recommendations.
 */
async function analyzeChanges(ctx: JobContext, brandName: string, changeReports: ChangeReport[]): Promise<void> {
  const { db, jobId, brandId } = ctx;

  // Prepare change summary for Claude
  const changeSummary = changeReports.map((report) => ({
    domain: report.domain,
    new_pages: report.new_pages.map((p) => ({
      url: p.url,
      title: p.title,
      meta_description: p.meta_description,
      word_count: p.word_count,
      headings: p.headings,
      schema_types: p.schema_types,
    })),
    changed_pages: report.changed_pages.map((p) => ({
      url: p.current.url,
      title: p.current.title,
      meta_description: p.current.meta_description,
      word_count: p.current.word_count,
      headings: p.current.headings,
      schema_types: p.current.schema_types,
    })),
    removed_urls: report.removed_urls,
  }));

  // Try loading the Claude prompt; fall back to raw data if not available
  let prompt;
  try {
    prompt = await loadActivePrompt('competitor_analyzer_v1');
  } catch {
    logger.warn({ jobId }, 'competitor_analyzer_v1 prompt not found, creating recommendations from raw data');
    await createRawRecommendations(ctx, changeReports);
    return;
  }

  try {
    const result = await callClaude(
      prompt,
      {
        brand_name: brandName,
        change_reports: JSON.stringify(changeSummary, null, 2),
        competitor_count: changeReports.length,
      },
      competitorAnalysisSchema,
      { trackUsage: { db, brandId, jobId } },
    );

    // Insert summary recommendation
    const [summaryRec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'competitor_monitor',
        priority: 'medium',
        title: 'Competitor Activity Summary',
        body: result.data.summary,
        data: {
          insights: result.data.insights,
          competitor_count: changeReports.length,
          total_new_pages: changeReports.reduce((s, r) => s + r.new_pages.length, 0),
          total_changed_pages: changeReports.reduce((s, r) => s + r.changed_pages.length, 0),
          total_removed_urls: changeReports.reduce((s, r) => s + r.removed_urls.length, 0),
        },
        model_meta: result.model_meta,
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: summaryRec.id, source: 'competitor_monitor', priority: 'medium' },
      `competitor:summary:${new Date().toISOString().slice(0, 10)}`,
      'competitor_monitor',
    );

    // Insert individual recommendations
    for (const rec of result.data.recommendations) {
      const [inserted] = await db
        .insert(recommendations)
        .values({
          brand_id: brandId,
          job_id: jobId,
          source: 'competitor_monitor',
          priority: rec.priority,
          title: rec.title,
          body: rec.description,
          data: { category: rec.category },
          model_meta: result.model_meta,
        })
        .returning();

      await emitEvent(
        EventType.RECOMMENDATION_CREATED,
        brandId,
        { recommendation_id: inserted.id, source: 'competitor_monitor', priority: rec.priority },
        `competitor:rec:${inserted.id}`,
        'competitor_monitor',
      );
    }

    logger.info(
      { jobId, brandId, recommendations: result.data.recommendations.length },
      'Competitor analysis recommendations created',
    );
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, 'Claude analysis failed, falling back to raw recommendations');
    await createRawRecommendations(ctx, changeReports);
  }
}

/**
 * Fallback: create recommendations from raw change data without Claude analysis.
 */
async function createRawRecommendations(ctx: JobContext, changeReports: ChangeReport[]): Promise<void> {
  const { db, jobId, brandId } = ctx;

  for (const report of changeReports) {
    const parts: string[] = [];

    if (report.new_pages.length > 0) {
      parts.push(
        `**New pages (${report.new_pages.length}):**\n` +
          report.new_pages.map((p) => `- ${p.url} — ${p.title || 'No title'}`).join('\n'),
      );
    }

    if (report.changed_pages.length > 0) {
      parts.push(
        `**Changed pages (${report.changed_pages.length}):**\n` +
          report.changed_pages.map((p) => `- ${p.current.url} — ${p.current.title || 'No title'}`).join('\n'),
      );
    }

    if (report.removed_urls.length > 0) {
      parts.push(
        `**Removed pages (${report.removed_urls.length}):**\n` + report.removed_urls.map((u) => `- ${u}`).join('\n'),
      );
    }

    if (parts.length === 0) continue;

    const body = `Competitor **${report.domain}** has made changes:\n\n` + parts.join('\n\n');

    const [rec] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'competitor_monitor',
        priority: 'medium',
        title: `Competitor changes detected: ${report.domain}`,
        body,
        data: {
          domain: report.domain,
          new_page_count: report.new_pages.length,
          changed_page_count: report.changed_pages.length,
          removed_url_count: report.removed_urls.length,
        },
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: rec.id, source: 'competitor_monitor', priority: 'medium' },
      `competitor:raw:${rec.id}`,
      'competitor_monitor',
    );
  }
}
