import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { brandProfileOutputSchema, type BrandGuardrails } from '@quadbot/shared';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';

/**
 * Fetch a brand's homepage content for analysis.
 * Tries common domain patterns derived from the brand name.
 */
async function fetchBrandWebsite(brandName: string): Promise<string | null> {
  // Build candidate URLs from brand name
  const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const slugDashed = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const candidates = [
    `https://www.${slug}.com`,
    `https://${slug}.com`,
    `https://www.${slugDashed}.com`,
    `https://${slugDashed}.com`,
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'QuadbotBrandProfiler/1.0' },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });

      if (!response.ok) continue;

      const html = await response.text();

      // Extract text content from HTML (strip tags, scripts, styles)
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000); // Limit to ~8k chars for the LLM context

      if (text.length > 100) {
        logger.info({ brandName, url }, 'Successfully fetched brand website');
        return text;
      }
    } catch {
      // Try next candidate
    }
  }

  logger.warn({ brandName }, 'Could not fetch brand website from any candidate URL');
  return null;
}

/**
 * Brand Profiler Job
 *
 * Auto-detects a brand's industry, description, audience, keywords, and competitors
 * by fetching the brand's website and analyzing it with Claude.
 *
 * Saves the result to brands.guardrails as structured JSON.
 */
export async function brandProfiler(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const brandName = brand.name;
  logger.info({ jobId, brandId, brandName }, 'Starting brand profiler');

  // Fetch website content
  const websiteContent = await fetchBrandWebsite(brandName);

  if (!websiteContent) {
    // Can't fetch website — set minimal guardrails with defaults
    const defaultGuardrails: BrandGuardrails = {
      industry: 'unknown',
      description: `${brandName} — brand profile could not be auto-detected. Please edit manually.`,
      target_audience: 'general',
      keywords: [brandName.toLowerCase()],
      competitors: [],
      content_policies: [
        'No tragedy/disaster exploitation',
        'No crime/violence references',
      ],
    };

    await db
      .update(brands)
      .set({ guardrails: defaultGuardrails, updated_at: new Date() })
      .where(eq(brands.id, brandId));

    logger.info({ jobId, brandId }, 'Brand profiler set default guardrails (website unreachable)');
    return;
  }

  // Call Claude to analyze the website
  const prompt = await loadActivePrompt('brand_profiler_v1');
  const result = await callClaude(
    prompt,
    {
      brand_name: brandName,
      website_content: websiteContent,
    },
    brandProfileOutputSchema,
  );

  // Merge with existing guardrails (preserve any user-set content_policies)
  const existingGuardrails = (brand.guardrails || {}) as Partial<BrandGuardrails>;

  const guardrails: BrandGuardrails = {
    industry: result.data.industry,
    description: result.data.description,
    target_audience: result.data.target_audience,
    keywords: result.data.keywords,
    competitors: result.data.competitors,
    content_policies: existingGuardrails.content_policies?.length
      ? existingGuardrails.content_policies
      : [
          'No tragedy/disaster exploitation',
          'No crime/violence references',
        ],
  };

  await db
    .update(brands)
    .set({ guardrails, updated_at: new Date() })
    .where(eq(brands.id, brandId));

  logger.info(
    { jobId, brandId, industry: guardrails.industry, keywordCount: guardrails.keywords.length },
    'Brand profiler completed — guardrails updated',
  );
}
