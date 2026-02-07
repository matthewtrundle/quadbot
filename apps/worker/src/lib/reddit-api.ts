/**
 * Reddit API integration for trending content research
 * Free tier: 100 queries/minute with OAuth
 * https://www.reddit.com/dev/api/
 */

import { logger } from '../logger.js';

export type RedditPost = {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  url: string;
  permalink: string;
  created_utc: number;
  is_self: boolean;
  link_flair_text: string | null;
};

type RedditListing = {
  kind: 'Listing';
  data: {
    children: Array<{ kind: 't3'; data: RedditPost }>;
    after: string | null;
    before: string | null;
  };
};

type RedditTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Reddit OAuth access token (application-only auth)
 */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.warn('REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET not configured');
    return null;
  }

  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Quadbot/1.0 (by /u/quadbot)',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'Reddit auth failed');
      return null;
    }

    const data = (await response.json()) as RedditTokenResponse;
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
  } catch (error) {
    logger.error({ error }, 'Reddit auth error');
    return null;
  }
}

/**
 * Fetch posts from Reddit API
 */
async function fetchReddit(endpoint: string): Promise<RedditListing | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(`https://oauth.reddit.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Quadbot/1.0 (by /u/quadbot)',
      },
    });

    if (!response.ok) {
      logger.error({ status: response.status, endpoint }, 'Reddit API error');
      return null;
    }

    return (await response.json()) as RedditListing;
  } catch (error) {
    logger.error({ error, endpoint }, 'Reddit fetch error');
    return null;
  }
}

/**
 * Get hot/trending posts from a subreddit
 */
export async function getSubredditHot(
  subreddit: string,
  limit = 10,
): Promise<RedditPost[]> {
  const data = await fetchReddit(`/r/${subreddit}/hot?limit=${limit}`);
  if (!data) return [];
  return data.data.children.map((c) => c.data);
}

/**
 * Get top posts from a subreddit for a time period
 */
export async function getSubredditTop(
  subreddit: string,
  timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'day',
  limit = 10,
): Promise<RedditPost[]> {
  const data = await fetchReddit(`/r/${subreddit}/top?t=${timeframe}&limit=${limit}`);
  if (!data) return [];
  return data.data.children.map((c) => c.data);
}

/**
 * Search Reddit for posts matching a query
 */
export async function searchReddit(
  query: string,
  options: {
    subreddit?: string;
    sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
    timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    limit?: number;
  } = {},
): Promise<RedditPost[]> {
  const { subreddit, sort = 'relevance', timeframe = 'week', limit = 10 } = options;

  const endpoint = subreddit
    ? `/r/${subreddit}/search?q=${encodeURIComponent(query)}&restrict_sr=on&sort=${sort}&t=${timeframe}&limit=${limit}`
    : `/search?q=${encodeURIComponent(query)}&sort=${sort}&t=${timeframe}&limit=${limit}`;

  const data = await fetchReddit(endpoint);
  if (!data) return [];
  return data.data.children.map((c) => c.data);
}

/**
 * Get trending posts from multiple subreddits
 */
export async function getTrendingFromSubreddits(
  subreddits: string[],
  postsPerSub = 5,
): Promise<Map<string, RedditPost[]>> {
  const results = new Map<string, RedditPost[]>();

  for (const sub of subreddits.slice(0, 5)) {
    const posts = await getSubredditHot(sub, postsPerSub);
    results.set(sub, posts);
  }

  return results;
}

/**
 * Industry-specific subreddit mappings
 */
export const INDUSTRY_SUBREDDITS: Record<string, string[]> = {
  technology: ['technology', 'programming', 'webdev', 'startups', 'tech'],
  marketing: ['marketing', 'digital_marketing', 'SEO', 'socialmedia', 'PPC'],
  ecommerce: ['ecommerce', 'shopify', 'FulfillmentByAmazon', 'smallbusiness', 'Entrepreneur'],
  finance: ['finance', 'personalfinance', 'investing', 'stocks', 'cryptocurrency'],
  health: ['health', 'fitness', 'nutrition', 'HealthIT', 'medicine'],
  travel: ['travel', 'solotravel', 'TravelHacks', 'digitalnomad', 'backpacking'],
  food: ['food', 'Cooking', 'recipes', 'FoodPorn', 'MealPrepSunday'],
  gaming: ['gaming', 'Games', 'pcgaming', 'IndieGaming', 'gamedev'],
  default: ['technology', 'business', 'Entrepreneur', 'marketing', 'news'],
};
