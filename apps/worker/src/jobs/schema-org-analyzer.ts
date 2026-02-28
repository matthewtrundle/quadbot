import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import { z } from 'zod';
import {
  extractJsonLd,
  extractMicrodata,
  inferPageType,
  validateSchemaForPage,
  type PageSchemaAnalysis,
  type SchemaOrgMarkup,
} from '../lib/schema-org-parser.js';

const schemaOrgOutputSchema = z.object({
  summary: z.string(),
  overall_score: z.number().min(0).max(100),
  recommendations: z.array(
    z.object({
      page_url: z.string(),
      page_type: z.string(),
      issue: z.string(),
      suggestion: z.string(),
      json_ld_snippet: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']),
      impact: z.string(),
    }),
  ),
  site_wide_suggestions: z.array(z.string()),
});

/**
 * Fetch a page's HTML content with a timeout.
 */
async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'QuadBot/1.0 (Schema.org Analyzer)',
        Accept: 'text/html',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Extract page title from HTML.
 */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

/**
 * Attempt to find pages from the sitemap.
 */
async function fetchSitemapUrls(siteUrl: string): Promise<string[]> {
  const baseUrl = siteUrl.replace(/\/$/, '');
  const sitemapCandidates = [baseUrl + '/sitemap.xml', baseUrl + '/sitemap_index.xml'];

  for (const sitemapUrl of sitemapCandidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'QuadBot/1.0 (Schema.org Analyzer)' },
      });
      clearTimeout(timeout);

      if (!response.ok) continue;
      const xml = await response.text();

      // Extract <loc> URLs from sitemap
      const urls: string[] = [];
      const locRegex = /<loc>\s*(https?:\/\/[^<]+?)\s*<\/loc>/gi;
      let match: RegExpExecArray | null;
      while ((match = locRegex.exec(xml)) !== null) {
        urls.push(match[1]);
      }

      if (urls.length > 0) return urls;
    } catch {
      // Try next candidate
    }
  }

  return [];
}

/**
 * Generate fallback pages to check if no sitemap is found.
 */
function generateFallbackUrls(siteUrl: string): string[] {
  const baseUrl = siteUrl.replace(/\/$/, '');
  return [
    baseUrl,
    baseUrl + '/about',
    baseUrl + '/contact',
    baseUrl + '/blog',
    baseUrl + '/products',
    baseUrl + '/services',
  ];
}

/**
 * Schema.org Structured Data Analyzer
 *
 * Crawls a brand's site pages and analyzes Schema.org structured data:
 * - Extracts JSON-LD and Microdata markup
 * - Validates completeness per page type
 * - Generates recommendations with ready-to-use JSON-LD snippets
 */
export async function schemaOrgAnalyzer(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'schema_org_analyzer' }, 'Schema_Org_Analyzer starting');

  // 1. Load brand and check modules_enabled
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error('Brand ' + brandId + ' not found');

  const modulesEnabled = (brand.modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('schema_org')) {
    logger.info({ jobId, brandId }, 'schema_org module not enabled, skipping');
    return;
  }

  // 2. Get site URL from GSC integration config
  const [integration] = await db
    .select({ config: brandIntegrations.config })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'google_search_console')))
    .limit(1);

  const config = integration?.config as Record<string, unknown> | undefined;
  const siteUrl = (config?.siteUrl as string) || (config?.site_url as string) || null;

  if (!siteUrl) {
    logger.info({ jobId, brandId }, 'No site URL configured, skipping schema analysis');
    return;
  }

  // 3. Fetch sitemap or use fallback pages
  let pageUrls = await fetchSitemapUrls(siteUrl);
  if (pageUrls.length === 0) {
    logger.info({ jobId, brandId, siteUrl }, 'No sitemap found, using fallback URLs');
    pageUrls = generateFallbackUrls(siteUrl);
  }

  // Limit to max 20 pages
  const pagesToAnalyze = pageUrls.slice(0, 20);
  logger.info({ jobId, brandId, pageCount: pagesToAnalyze.length }, 'Analyzing pages for Schema.org markup');

  // 4. Fetch and analyze each page
  const pageAnalyses: PageSchemaAnalysis[] = [];
  let pagesWithSchema = 0;
  let totalSchemas = 0;
  let totalIssues = 0;

  for (let i = 0; i < pagesToAnalyze.length; i++) {
    const pageUrl = pagesToAnalyze[i];

    // 1-second delay between fetches (skip delay for first page)
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }

    const html = await fetchPageHtml(pageUrl);
    if (!html) {
      logger.debug({ jobId, pageUrl }, 'Failed to fetch page, skipping');
      continue;
    }

    const title = extractTitle(html);
    const jsonLdSchemas = extractJsonLd(html);
    const microdataSchemas = extractMicrodata(html);
    const allSchemas = [...jsonLdSchemas, ...microdataSchemas];

    const pageType = inferPageType(pageUrl, title);
    const pageIssues = validateSchemaForPage(allSchemas, pageType);

    // Collect all issues
    const allIssues: string[] = [];
    for (const schema of allSchemas) {
      allIssues.push(...schema.issues);
    }
    allIssues.push(...pageIssues);

    const analysis: PageSchemaAnalysis = {
      url: pageUrl,
      schemas: allSchemas,
      missing_recommended: pageIssues,
      issues: allIssues,
    };

    pageAnalyses.push(analysis);

    if (allSchemas.length > 0) pagesWithSchema++;
    totalSchemas += allSchemas.length;
    totalIssues += allIssues.length;
  }

  if (pageAnalyses.length === 0) {
    logger.info({ jobId, brandId }, 'No pages could be fetched, skipping schema analysis');
    return;
  }

  logger.info(
    {
      jobId,
      brandId,
      pagesAnalyzed: pageAnalyses.length,
      pagesWithSchema,
      totalSchemas,
      totalIssues,
    },
    'Schema.org analysis complete, sending to Claude',
  );

  // 5. Prepare analysis data for Claude (strip raw HTML to reduce tokens)
  const analysisData = pageAnalyses.map((pa) => ({
    url: pa.url,
    page_type: inferPageType(pa.url, null),
    schemas_found: pa.schemas.map((s) => ({
      format: s.format,
      types: s.types,
      properties: Object.keys(s.properties),
      issues: s.issues,
    })),
    missing_recommended: pa.missing_recommended,
    issues: pa.issues,
  }));

  // 6. Call Claude for optimization suggestions
  const guardrails = (brand.guardrails || {}) as Record<string, unknown>;

  let prompt;
  try {
    prompt = await loadActivePrompt('schema_org_optimizer_v1');
  } catch {
    logger.warn({ jobId }, 'schema_org_optimizer_v1 prompt not found, creating raw recommendations');

    // Fallback: create recommendations directly from analysis data
    let created = 0;
    for (const analysis of pageAnalyses) {
      if (analysis.issues.length === 0) continue;

      const issuesList = analysis.issues.map((i) => '- ' + i).join('\n');
      const schemasDesc =
        analysis.schemas.length > 0
          ? analysis.schemas.map((s) => s.format + ': ' + s.types.join(', ')).join('; ')
          : 'None';

      const [rec] = await db
        .insert(recommendations)
        .values({
          brand_id: brandId,
          job_id: jobId,
          source: 'schema_org_analyzer',
          priority: analysis.issues.length > 3 ? 'high' : 'medium',
          title: 'Schema.org issues on ' + analysis.url,
          body: '**Issues found:**\n' + issuesList + '\n\n**Schemas detected:** ' + schemasDesc,
          data: {
            type: 'schema_org',
            page_url: analysis.url,
            page_type: inferPageType(analysis.url, null),
            schemas_found: analysis.schemas.length,
            issues: analysis.issues,
          },
        })
        .returning();

      await emitEvent(
        EventType.RECOMMENDATION_CREATED,
        brandId,
        { recommendation_id: rec.id, source: 'schema_org_analyzer', priority: rec.priority },
        'rec:' + rec.id,
        'schema_org_analyzer',
      );
      created++;
    }

    logger.info(
      {
        jobId,
        brandId,
        jobType: 'schema_org_analyzer',
        created,
        fallback: true,
        durationMs: Date.now() - startTime,
      },
      'Schema_Org_Analyzer completed (fallback mode)',
    );
    return;
  }

  const result = await callClaude(
    prompt,
    {
      brand_name: brand.name,
      brand_domain: siteUrl,
      brand_industry: guardrails.industry || 'unknown',
      analysis_data: JSON.stringify(analysisData, null, 2),
      pages_analyzed: String(pageAnalyses.length),
      pages_with_schema: String(pagesWithSchema),
      total_issues: String(totalIssues),
    },
    schemaOrgOutputSchema,
    { trackUsage: { db, brandId, jobId } },
  );

  // 7. Create summary recommendation
  const siteWideSuggestions = result.data.site_wide_suggestions.map((s) => '- ' + s).join('\n');
  const [summaryRec] = await db
    .insert(recommendations)
    .values({
      brand_id: brandId,
      job_id: jobId,
      source: 'schema_org_analyzer',
      priority: result.data.overall_score < 50 ? 'high' : 'medium',
      title: 'Schema.org Analysis: Score ' + result.data.overall_score + '/100',
      body: result.data.summary + '\n\n**Site-wide suggestions:**\n' + siteWideSuggestions,
      data: {
        type: 'schema_org_summary',
        overall_score: result.data.overall_score,
        pages_analyzed: pageAnalyses.length,
        pages_with_schema: pagesWithSchema,
        total_issues: totalIssues,
        site_wide_suggestions: result.data.site_wide_suggestions,
      },
      model_meta: result.model_meta,
    })
    .returning();

  await emitEvent(
    EventType.RECOMMENDATION_CREATED,
    brandId,
    { recommendation_id: summaryRec.id, source: 'schema_org_analyzer', priority: summaryRec.priority },
    'rec:' + summaryRec.id,
    'schema_org_analyzer',
  );

  // 8. Create per-page recommendations with JSON-LD snippets
  let created = 0;
  for (const rec of result.data.recommendations) {
    const bodyParts = [
      '**Issue:** ' + rec.issue,
      '**Suggestion:** ' + rec.suggestion,
      '**Expected Impact:** ' + rec.impact,
    ];
    if (rec.json_ld_snippet) {
      bodyParts.push('\n**Ready-to-use JSON-LD:**\n```json\n' + rec.json_ld_snippet + '\n```');
    }

    const [inserted] = await db
      .insert(recommendations)
      .values({
        brand_id: brandId,
        job_id: jobId,
        source: 'schema_org_analyzer',
        priority: rec.priority,
        title: 'Schema.org: ' + rec.page_type + ' — ' + rec.page_url,
        body: bodyParts.join('\n'),
        data: {
          type: 'schema_org_page',
          page_url: rec.page_url,
          page_type: rec.page_type,
          json_ld_snippet: rec.json_ld_snippet || null,
        },
        model_meta: result.model_meta,
      })
      .returning();

    await emitEvent(
      EventType.RECOMMENDATION_CREATED,
      brandId,
      { recommendation_id: inserted.id, source: 'schema_org_analyzer', priority: rec.priority },
      'rec:' + inserted.id,
      'schema_org_analyzer',
    );
    created++;
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'schema_org_analyzer',
      overallScore: result.data.overall_score,
      pagesAnalyzed: pageAnalyses.length,
      pagesWithSchema,
      recommendationsCreated: created + 1, // +1 for summary
      durationMs: Date.now() - startTime,
    },
    'Schema_Org_Analyzer completed',
  );
}
