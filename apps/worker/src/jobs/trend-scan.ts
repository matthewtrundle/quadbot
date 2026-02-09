import { recommendations, brands, brandIntegrations, artifacts } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { trendFilterOutputSchema, trendContentBriefSchema, type BrandGuardrails, type TrendFilterItem } from '@quadbot/shared';
import type { JobContext } from '../registry.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';
import { logger } from '../logger.js';
import { searchNews, getTopHeadlines, searchBrandMentions, type NewsArticle } from '../lib/news-api.js';
import { getTrendingFromSubreddits, searchReddit, INDUSTRY_SUBREDDITS, type RedditPost } from '../lib/reddit-api.js';
import { brandProfiler } from './brand-profiler.js';

type BrandConfig = {
  industry?: string;
  keywords?: string[];
  competitors?: string[];
  subreddits?: string[];
};

/**
 * Get brand configuration from guardrails + integration config
 */
async function getBrandConfig(ctx: JobContext, guardrails: BrandGuardrails | null): Promise<BrandConfig> {
  const { db, brandId } = ctx;

  // First check for explicit integration config
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(
      and(
        eq(brandIntegrations.brand_id, brandId),
        eq(brandIntegrations.type, 'trend_config'),
      ),
    )
    .limit(1);

  if (integration?.config) {
    return integration.config as BrandConfig;
  }

  // Use guardrails to build config if available
  if (guardrails?.industry && guardrails.industry !== 'unknown') {
    return {
      industry: guardrails.industry,
      keywords: guardrails.keywords?.length ? guardrails.keywords : [],
      competitors: guardrails.competitors?.length ? guardrails.competitors : [],
      subreddits: [],
    };
  }

  // Default config
  return {
    industry: 'default',
    keywords: [],
    competitors: [],
    subreddits: [],
  };
}

/**
 * Analyze news for content opportunities
 */
function analyzeNewsForContent(articles: NewsArticle[], brandName: string): {
  opportunities: Array<{ title: string; description: string; url: string; priority: 'low' | 'medium' | 'high' }>;
} {
  const opportunities = articles
    .filter((a) => a.title && a.description)
    .slice(0, 5)
    .map((article) => ({
      title: `Content opportunity: ${article.title.slice(0, 60)}...`,
      description: `Trending topic from ${article.source.name}: "${article.title}". Consider creating content around this trending subject to capture search interest.`,
      url: article.url,
      priority: 'medium' as const,
    }));

  return { opportunities };
}

/**
 * Analyze Reddit for content ideas
 */
function analyzeRedditForContent(
  postsBySubreddit: Map<string, RedditPost[]>,
): Array<{ title: string; description: string; subreddit: string; score: number; priority: 'low' | 'medium' | 'high' }> {
  const ideas: Array<{ title: string; description: string; subreddit: string; score: number; priority: 'low' | 'medium' | 'high' }> = [];

  for (const [subreddit, posts] of postsBySubreddit) {
    // Find high-engagement posts
    const hotPosts = posts
      .filter((p) => p.score > 100 && p.num_comments > 20)
      .slice(0, 2);

    for (const post of hotPosts) {
      ideas.push({
        title: `Reddit trend in r/${subreddit}: ${post.title.slice(0, 50)}...`,
        description: `High-engagement discussion (${post.score} upvotes, ${post.num_comments} comments). This topic resonates with the community - consider creating content addressing this.`,
        subreddit,
        score: post.score,
        priority: post.score > 500 ? 'high' : 'medium',
      });
    }
  }

  return ideas.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Check for brand/competitor mentions
 */
function analyzeBrandMentions(
  brandArticles: NewsArticle[],
  competitorArticles: Map<string, NewsArticle[]>,
  brandName: string,
): Array<{ title: string; description: string; type: 'brand' | 'competitor'; priority: 'low' | 'medium' | 'high' }> {
  const mentions: Array<{ title: string; description: string; type: 'brand' | 'competitor'; priority: 'low' | 'medium' | 'high' }> = [];

  // Brand mentions
  for (const article of brandArticles.slice(0, 3)) {
    mentions.push({
      title: `Brand mention: ${brandName} in ${article.source.name}`,
      description: `Your brand was mentioned in "${article.title}". Review for PR opportunities or reputation management.`,
      type: 'brand',
      priority: 'high',
    });
  }

  // Competitor mentions
  for (const [competitor, articles] of competitorArticles) {
    if (articles.length > 0) {
      mentions.push({
        title: `Competitor news: ${competitor}`,
        description: `${competitor} appeared in ${articles.length} article(s). Latest: "${articles[0].title}". Monitor for competitive insights.`,
        type: 'competitor',
        priority: 'medium',
      });
    }
  }

  return mentions;
}

/**
 * Run the LLM relevance + sensitivity filter on collected trends.
 * Returns only relevant, non-sensitive trends. Falls back to unfiltered on error.
 */
async function filterTrendsWithLLM(
  allRecommendations: Array<{ title: string; body: string; priority: 'low' | 'medium' | 'high' | 'critical'; data: Record<string, unknown> }>,
  guardrails: BrandGuardrails,
  brandName: string,
  jobId: string,
): Promise<{
  filtered: typeof allRecommendations;
  filterApplied: boolean;
  filterMeta: Record<string, unknown> | null;
}> {
  if (allRecommendations.length === 0) {
    return { filtered: allRecommendations, filterApplied: false, filterMeta: null };
  }

  try {
    const prompt = await loadActivePrompt('trend_relevance_filter_v1');

    // Build a compact JSON of trends for the LLM
    const trendsJson = allRecommendations.map((rec, i) => ({
      index: i,
      title: rec.title,
      body: rec.body.slice(0, 200),
      priority: rec.priority,
      source: rec.data.source || rec.data.type,
    }));

    const result = await callClaude(
      prompt,
      {
        brand_name: brandName,
        brand_industry: guardrails.industry || 'unknown',
        brand_description: guardrails.description || '',
        brand_audience: guardrails.target_audience || 'general',
        brand_keywords: (guardrails.keywords || []).join(', '),
        brand_policies: (guardrails.content_policies || []).join(', '),
        trends_json: JSON.stringify(trendsJson, null, 2),
      },
      trendFilterOutputSchema,
    );

    // Build a lookup of filter results by index
    const filterMap = new Map<number, TrendFilterItem>();
    for (const item of result.data.filtered_trends) {
      filterMap.set(item.index, item);
    }

    // Keep only relevant + non-sensitive trends with sufficient confidence.
    // If the LLM didn't evaluate a trend, EXCLUDE it (safe default).
    const MIN_RELEVANCE_CONFIDENCE = 0.6;
    const filtered = allRecommendations.filter((_, i) => {
      const verdict = filterMap.get(i);
      if (!verdict) return false; // LLM didn't evaluate → exclude
      return verdict.relevant && !verdict.sensitive && verdict.relevance_confidence >= MIN_RELEVANCE_CONFIDENCE;
    });

    // Update priorities based on LLM assessment
    for (const rec of filtered) {
      const idx = allRecommendations.indexOf(rec);
      const verdict = filterMap.get(idx);
      if (verdict) {
        rec.priority = verdict.priority;
        if (verdict.suggested_angle) {
          rec.body += `\n\nSuggested angle: ${verdict.suggested_angle}`;
        }
      }
    }

    const removedCount = allRecommendations.length - filtered.length;
    const sensitiveCount = result.data.filtered_trends.filter((t) => t.sensitive).length;
    const irrelevantCount = result.data.filtered_trends.filter((t) => !t.relevant).length;
    const lowConfidenceCount = result.data.filtered_trends.filter(
      (t) => t.relevant && !t.sensitive && t.relevance_confidence < MIN_RELEVANCE_CONFIDENCE,
    ).length;

    logger.info(
      { jobId, total: allRecommendations.length, kept: filtered.length, removed: removedCount, sensitive: sensitiveCount, irrelevant: irrelevantCount, lowConfidence: lowConfidenceCount },
      'LLM trend filter applied',
    );

    return {
      filtered,
      filterApplied: true,
      filterMeta: {
        ...result.model_meta,
        total: allRecommendations.length,
        kept: filtered.length,
        removed: removedCount,
        sensitive: sensitiveCount,
        irrelevant: irrelevantCount,
        low_confidence: lowConfidenceCount,
        min_confidence_threshold: MIN_RELEVANCE_CONFIDENCE,
      },
    };
  } catch (err) {
    // Hard failure: do NOT fall back to unfiltered trends.
    // Unfiltered trends pollute the pipeline with irrelevant recommendations.
    logger.error({ err, jobId }, 'LLM trend filter failed — discarding all trends (no silent fallback)');
    return { filtered: [], filterApplied: false, filterMeta: null };
  }
}

/**
 * Ensure guardrails are populated, running brand profiler if needed (lazy auto-detect).
 */
async function ensureGuardrails(ctx: JobContext, brand: { id: string; name: string; guardrails: Record<string, unknown> | null }): Promise<BrandGuardrails | null> {
  const guardrails = brand.guardrails as Partial<BrandGuardrails> | null;

  // Check if guardrails are already populated with meaningful data
  if (guardrails?.industry && guardrails.industry !== 'unknown') {
    return guardrails as BrandGuardrails;
  }

  // Run brand profiler inline (lazy auto-detect)
  logger.info({ brandId: brand.id }, 'Guardrails empty — running lazy brand profiler');
  try {
    await brandProfiler(ctx);

    // Re-read the brand to get updated guardrails
    const [updated] = await ctx.db.select().from(brands).where(eq(brands.id, brand.id)).limit(1);
    if (updated?.guardrails) {
      return updated.guardrails as BrandGuardrails;
    }
  } catch (err) {
    logger.warn({ err, brandId: brand.id }, 'Lazy brand profiler failed — continuing without guardrails');
  }

  return null;
}

/**
 * Enrich a content_opportunity recommendation with a structured multi-platform content brief.
 * Returns the brief content or null if enrichment fails.
 */
/**
 * Gather source evidence from a recommendation's data for grounding.
 */
function gatherSourceEvidence(data: Record<string, unknown>): string {
  const parts: string[] = [];

  // Source URLs from news articles
  const articles = data.articles as Array<{ title?: string; url?: string; source?: string }> | undefined;
  if (articles?.length) {
    for (const article of articles) {
      parts.push(`- Article: "${article.title || 'untitled'}" (${article.source || 'unknown source'}) — ${article.url || 'no URL'}`);
    }
  }

  // Source URL if directly available
  if (data.url) {
    parts.push(`- Source URL: ${data.url}`);
  }

  // Subreddit if from Reddit
  if (data.subreddit) {
    parts.push(`- Subreddit: r/${data.subreddit} (score: ${data.score || 'unknown'})`);
  }

  // Keyword if from keyword search
  if (data.keyword) {
    parts.push(`- Search keyword: "${data.keyword}"`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No source evidence available';
}

async function enrichTrendWithBrief(
  rec: { title: string; body: string; data: Record<string, unknown> },
  guardrails: BrandGuardrails,
  brandName: string,
  jobId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const prompt = await loadActivePrompt('trend_brief_enricher_v1');

    const result = await callClaude(
      prompt,
      {
        trend_title: rec.title,
        trend_body: rec.body,
        trend_source: String(rec.data.source || 'unknown'),
        trend_evidence: gatherSourceEvidence(rec.data),
        brand_name: brandName,
        brand_industry: guardrails.industry || 'unknown',
        brand_description: guardrails.description || '',
        brand_audience: guardrails.target_audience || 'general',
        brand_keywords: (guardrails.keywords || []).join(', '),
      },
      trendContentBriefSchema,
    );

    logger.info({ jobId, recTitle: rec.title }, 'Generated content brief for trend');
    return result.data as unknown as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err, jobId, recTitle: rec.title }, 'Content brief enrichment failed — skipping');
    return null;
  }
}

export async function trendScanIndustry(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;

  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  // Check if trend scan module is enabled for this brand
  const modulesEnabled = (brand[0].modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('trend_scan')) {
    logger.info({ jobId, brandId }, 'Trend scan module not enabled, skipping');
    return;
  }

  const brandName = brand[0].name;

  // Ensure guardrails are populated (lazy auto-detect if needed)
  const guardrails = await ensureGuardrails(ctx, brand[0]);

  // Hard gate: refuse to run with unknown/missing guardrails.
  // Without knowing what the brand does, we can't assess relevance and
  // would flood the pipeline with generic news recommendations.
  if (!guardrails || !guardrails.industry || guardrails.industry === 'unknown') {
    logger.warn(
      { jobId, brandId, hasGuardrails: !!guardrails, industry: guardrails?.industry },
      'Trend scan skipped: brand guardrails incomplete (industry unknown). Run brand profiler first.',
    );
    await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'trend_scan',
      priority: 'low',
      title: 'Trend Scan Skipped: Brand Profile Needed',
      body: `Could not run trend scan for ${brandName} because the brand profile is incomplete (industry unknown). Please update the brand profile or ensure the website is accessible for auto-detection.`,
      data: { skipped: true, reason: 'guardrails_incomplete' },
    });
    return;
  }

  const config = await getBrandConfig(ctx, guardrails);
  const industry = config.industry || 'default';
  const keywords = config.keywords?.length ? config.keywords : [brandName];
  const competitors = config.competitors || [];
  const subreddits = config.subreddits?.length
    ? config.subreddits
    : INDUSTRY_SUBREDDITS[industry] || INDUSTRY_SUBREDDITS.default;

  logger.info({ jobId, brandId, industry, subreddits, hasGuardrails: !!guardrails }, 'Starting trend scan');

  // Collect all recommendations
  const allRecommendations: Array<{
    title: string;
    body: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    data: Record<string, unknown>;
  }> = [];

  // 1. Industry News Headlines
  const headlines = await getTopHeadlines({
    category: industry === 'technology' ? 'technology' : 'business',
    pageSize: 10,
  });

  if (headlines.length > 0) {
    const newsAnalysis = analyzeNewsForContent(headlines, brandName);
    for (const opp of newsAnalysis.opportunities) {
      allRecommendations.push({
        title: opp.title,
        body: opp.description,
        priority: opp.priority,
        data: { type: 'content_opportunity', source: 'news', url: opp.url },
      });
    }
    logger.info({ jobId, count: headlines.length }, 'Analyzed news headlines');
  }

  // 2. Keyword-specific News Search
  for (const keyword of keywords.slice(0, 2)) {
    const keywordNews = await searchNews({ query: keyword, pageSize: 5 });
    if (keywordNews.length > 0) {
      allRecommendations.push({
        title: `Industry update: ${keyword}`,
        body: `Found ${keywordNews.length} recent articles about "${keyword}". Top story: "${keywordNews[0].title}" from ${keywordNews[0].source.name}.`,
        priority: 'low',
        data: {
          type: 'industry_awareness',
          source: 'news',
          keyword,
          articles: keywordNews.slice(0, 3).map((a) => ({ title: a.title, url: a.url, source: a.source.name })),
        },
      });
    }
  }

  // 3. Reddit Trending
  const redditTrending = await getTrendingFromSubreddits(subreddits, 5);
  const redditIdeas = analyzeRedditForContent(redditTrending);

  for (const idea of redditIdeas) {
    allRecommendations.push({
      title: idea.title,
      body: idea.description,
      priority: idea.priority,
      data: { type: 'content_opportunity', source: 'reddit', subreddit: idea.subreddit, score: idea.score },
    });
  }

  if (redditTrending.size > 0) {
    logger.info({ jobId, subredditsScanned: redditTrending.size }, 'Analyzed Reddit trends');
  }

  // 4. Brand & Competitor Monitoring
  if (brandName || competitors.length > 0) {
    const mentions = await searchBrandMentions(brandName, competitors);
    const mentionAnalysis = analyzeBrandMentions(mentions.brand, mentions.competitors, brandName);

    for (const mention of mentionAnalysis) {
      allRecommendations.push({
        title: mention.title,
        body: mention.description,
        priority: mention.priority,
        data: { type: 'brand_monitoring', mention_type: mention.type },
      });
    }

    if (mentions.brand.length > 0 || mentions.competitors.size > 0) {
      logger.info(
        { jobId, brandMentions: mentions.brand.length, competitorMentions: mentions.competitors.size },
        'Analyzed brand mentions',
      );
    }
  }

  // 5. Apply LLM relevance + sensitivity filter (always — guardrails guaranteed by gate above)
  let finalRecommendations = allRecommendations;
  let filterMeta: Record<string, unknown> | null = null;

  if (allRecommendations.length > 0) {
    const filterResult = await filterTrendsWithLLM(allRecommendations, guardrails, brandName, jobId);
    finalRecommendations = filterResult.filtered;
    filterMeta = filterResult.filterMeta;
  }

  // 6. Insert recommendations (or summary if none found)
  if (finalRecommendations.length === 0) {
    await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'trend_scan',
      priority: 'low',
      title: 'Trend Scan Complete',
      body: `Scanned industry news and Reddit for ${brandName}. ${allRecommendations.length > 0 ? `Found ${allRecommendations.length} trends but none were relevant to your brand profile.` : 'No significant trending topics detected requiring immediate action.'}`,
      data: { subreddits_scanned: subreddits, industry, has_news_api: !!process.env.NEWS_API_KEY, has_reddit_api: !!process.env.REDDIT_CLIENT_ID, filter_applied: !!filterMeta, raw_count: allRecommendations.length },
      model_meta: filterMeta,
    });
  } else {
    // Insert summary
    await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'trend_scan',
      priority: 'medium',
      title: `Trend Scan: ${finalRecommendations.length} relevant items found`,
      body: `Discovered ${finalRecommendations.length} relevant trending topics for ${brandName}${allRecommendations.length > finalRecommendations.length ? ` (filtered from ${allRecommendations.length} raw trends)` : ''}.`,
      data: {
        total_items: finalRecommendations.length,
        raw_items: allRecommendations.length,
        filter_applied: !!filterMeta,
        by_type: {
          content_opportunities: finalRecommendations.filter((r) => r.data.type === 'content_opportunity').length,
          industry_awareness: finalRecommendations.filter((r) => r.data.type === 'industry_awareness').length,
          brand_monitoring: finalRecommendations.filter((r) => r.data.type === 'brand_monitoring').length,
        },
      },
      model_meta: filterMeta,
    });

    // Insert individual recommendations and enrich content opportunities with briefs
    for (const rec of finalRecommendations) {
      const isContentOpportunity = rec.data.type === 'content_opportunity';

      // Enrich content opportunities with briefs (only if guardrails available)
      let briefContent: Record<string, unknown> | null = null;
      if (isContentOpportunity && guardrails) {
        briefContent = await enrichTrendWithBrief(rec, guardrails, brandName, jobId);
      }

      const [inserted] = await db.insert(recommendations).values({
        brand_id: brandId,
        job_id: jobId,
        source: 'trend_scan',
        priority: rec.priority,
        title: rec.title,
        body: rec.body,
        data: { ...rec.data, has_content_brief: !!briefContent },
        model_meta: filterMeta,
      }).returning({ id: recommendations.id });

      // Store brief as an artifact linked to the recommendation
      if (briefContent && inserted) {
        try {
          await db.insert(artifacts).values({
            brand_id: brandId,
            recommendation_id: inserted.id,
            type: 'trend_content_brief',
            title: `Content Brief: ${rec.title}`,
            content: briefContent,
            status: 'draft',
          });
          logger.info({ jobId, recommendationId: inserted.id }, 'Stored trend content brief artifact');
        } catch (err) {
          logger.warn({ err, jobId, recommendationId: inserted.id }, 'Failed to store content brief artifact');
        }
      }
    }
  }

  logger.info(
    { jobId, rawCount: allRecommendations.length, filteredCount: finalRecommendations.length, filterApplied: !!filterMeta },
    'Trend scan complete',
  );
}
