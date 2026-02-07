/**
 * News API integration for trending content research
 * Uses NewsAPI.org - Free tier: 100 requests/day, 24h delay
 * https://newsapi.org/docs
 */

import { logger } from '../logger.js';

export type NewsArticle = {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
};

export type NewsApiResponse = {
  status: 'ok' | 'error';
  totalResults: number;
  articles: NewsArticle[];
  code?: string;
  message?: string;
};

const NEWS_API_BASE = 'https://newsapi.org/v2';

/**
 * Search for news articles by keywords
 */
export async function searchNews(params: {
  query: string;
  language?: string;
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  pageSize?: number;
}): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    logger.warn('NEWS_API_KEY not configured, skipping news search');
    return [];
  }

  const { query, language = 'en', sortBy = 'publishedAt', pageSize = 10 } = params;

  const url = new URL(`${NEWS_API_BASE}/everything`);
  url.searchParams.set('q', query);
  url.searchParams.set('language', language);
  url.searchParams.set('sortBy', sortBy);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('apiKey', apiKey);

  try {
    const response = await fetch(url.toString());
    const data = (await response.json()) as NewsApiResponse;

    if (data.status !== 'ok') {
      logger.error({ code: data.code, message: data.message }, 'NewsAPI error');
      return [];
    }

    return data.articles;
  } catch (error) {
    logger.error({ error, query }, 'Failed to fetch news');
    return [];
  }
}

/**
 * Get top headlines for a category or country
 */
export async function getTopHeadlines(params: {
  category?: 'business' | 'entertainment' | 'general' | 'health' | 'science' | 'sports' | 'technology';
  country?: string;
  query?: string;
  pageSize?: number;
}): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    logger.warn('NEWS_API_KEY not configured, skipping headlines');
    return [];
  }

  const { category, country = 'us', query, pageSize = 10 } = params;

  const url = new URL(`${NEWS_API_BASE}/top-headlines`);
  url.searchParams.set('country', country);
  if (category) url.searchParams.set('category', category);
  if (query) url.searchParams.set('q', query);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('apiKey', apiKey);

  try {
    const response = await fetch(url.toString());
    const data = (await response.json()) as NewsApiResponse;

    if (data.status !== 'ok') {
      logger.error({ code: data.code, message: data.message }, 'NewsAPI headlines error');
      return [];
    }

    return data.articles;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch headlines');
    return [];
  }
}

/**
 * Search for brand mentions in news
 */
export async function searchBrandMentions(
  brandName: string,
  competitors: string[] = [],
): Promise<{ brand: NewsArticle[]; competitors: Map<string, NewsArticle[]> }> {
  const brandArticles = await searchNews({
    query: `"${brandName}"`,
    sortBy: 'publishedAt',
    pageSize: 5,
  });

  const competitorArticles = new Map<string, NewsArticle[]>();
  for (const competitor of competitors.slice(0, 3)) {
    const articles = await searchNews({
      query: `"${competitor}"`,
      sortBy: 'publishedAt',
      pageSize: 3,
    });
    competitorArticles.set(competitor, articles);
  }

  return { brand: brandArticles, competitors: competitorArticles };
}
