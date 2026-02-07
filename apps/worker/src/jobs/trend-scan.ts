import { recommendations, brands, brandIntegrations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { searchNews, getTopHeadlines, searchBrandMentions, type NewsArticle } from '../lib/news-api.js';
import { getTrendingFromSubreddits, searchReddit, INDUSTRY_SUBREDDITS, type RedditPost } from '../lib/reddit-api.js';

type BrandConfig = {
  industry?: string;
  keywords?: string[];
  competitors?: string[];
  subreddits?: string[];
};

/**
 * Get brand configuration from integration config or defaults
 */
async function getBrandConfig(ctx: JobContext): Promise<BrandConfig> {
  const { db, brandId } = ctx;

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

  // Default config based on brand name
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
  const config = await getBrandConfig(ctx);
  const industry = config.industry || 'default';
  const keywords = config.keywords || [brandName];
  const competitors = config.competitors || [];
  const subreddits = config.subreddits?.length
    ? config.subreddits
    : INDUSTRY_SUBREDDITS[industry] || INDUSTRY_SUBREDDITS.default;

  logger.info({ jobId, brandId, industry, subreddits }, 'Starting trend scan');

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

  // 5. Insert recommendations (or summary if none found)
  if (allRecommendations.length === 0) {
    await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'trend_scan',
      priority: 'low',
      title: 'Trend Scan Complete',
      body: `Scanned industry news and Reddit for ${brandName}. No significant trending topics detected requiring immediate action.`,
      data: { subreddits_scanned: subreddits, industry, has_news_api: !!process.env.NEWS_API_KEY, has_reddit_api: !!process.env.REDDIT_CLIENT_ID },
      model_meta: null,
    });
  } else {
    // Insert summary
    await db.insert(recommendations).values({
      brand_id: brandId,
      job_id: jobId,
      source: 'trend_scan',
      priority: 'medium',
      title: `Trend Scan: ${allRecommendations.length} items found`,
      body: `Discovered ${allRecommendations.length} trending topics and mentions across news and Reddit for ${brandName}.`,
      data: {
        total_items: allRecommendations.length,
        by_type: {
          content_opportunities: allRecommendations.filter((r) => r.data.type === 'content_opportunity').length,
          industry_awareness: allRecommendations.filter((r) => r.data.type === 'industry_awareness').length,
          brand_monitoring: allRecommendations.filter((r) => r.data.type === 'brand_monitoring').length,
        },
      },
      model_meta: null,
    });

    // Insert individual recommendations
    for (const rec of allRecommendations) {
      await db.insert(recommendations).values({
        brand_id: brandId,
        job_id: jobId,
        source: 'trend_scan',
        priority: rec.priority,
        title: rec.title,
        body: rec.body,
        data: rec.data,
        model_meta: null,
      });
    }
  }

  logger.info(
    { jobId, recommendationsCount: allRecommendations.length },
    'Trend scan complete',
  );
}
