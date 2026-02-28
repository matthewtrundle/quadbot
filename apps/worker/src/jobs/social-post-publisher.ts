/**
 * Social Post Publisher Job
 *
 * Publishes social media posts to configured platforms (Twitter/X, LinkedIn).
 *
 * Payload:
 *   platform: 'twitter' | 'linkedin'
 *   content: string — the text content to post
 *   media_urls?: string[] — optional media URLs (reserved for future use)
 *   recommendation_id?: string — optional link to the recommendation that generated this post
 */

import { brands, brandIntegrations, decrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { postTweet } from '../lib/social/twitter-api.js';
import { postToLinkedIn } from '../lib/social/linkedin-api.js';
import type { SocialPlatform, SocialPostResult } from '../lib/social/types.js';

export type SocialPostPublisherPayload = {
  platform: SocialPlatform;
  content: string;
  media_urls?: string[];
  recommendation_id?: string;
};

type SocialTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  author_urn?: string; // LinkedIn author URN
};

/**
 * Validate the job payload for required fields and correct types.
 */
export function validatePayload(
  payload: Record<string, unknown>,
): { valid: true; data: SocialPostPublisherPayload } | { valid: false; error: string } {
  const { platform, content } = payload;

  if (!platform || (platform !== 'twitter' && platform !== 'linkedin')) {
    return { valid: false, error: 'Missing or invalid platform. Must be "twitter" or "linkedin".' };
  }

  if (!content || typeof content !== 'string' || content.trim() === '') {
    return { valid: false, error: 'Missing or empty content.' };
  }

  if (platform === 'twitter' && content.length > 280) {
    return { valid: false, error: `Tweet content exceeds 280 characters (${content.length}).` };
  }

  return {
    valid: true,
    data: {
      platform: platform as SocialPlatform,
      content: content as string,
      media_urls: payload.media_urls as string[] | undefined,
      recommendation_id: payload.recommendation_id as string | undefined,
    },
  };
}

/**
 * Route the post to the appropriate platform API.
 */
export function routePlatform(platform: SocialPlatform): 'twitter' | 'linkedin' {
  return platform;
}

export async function socialPostPublisher(ctx: JobContext): Promise<void> {
  const { db, brandId, jobId, payload } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'social_post_publisher' }, 'Social_Post_Publisher starting');

  // 1. Load brand, check modules_enabled includes 'social_posting'
  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) {
    throw new Error(`Brand ${brandId} not found`);
  }

  const modulesEnabled = (brand[0].modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('social_posting')) {
    logger.info({ jobId, brandId }, 'Social posting module not enabled, skipping');
    return;
  }

  // 2. Validate payload
  const validation = validatePayload(payload);
  if (!validation.valid) {
    throw new Error(`Invalid payload: ${validation.error}`);
  }
  const { platform, content, recommendation_id } = validation.data;

  logger.info({ jobId, brandId, platform, contentLength: content.length }, 'Publishing social post');

  // 3. Load platform credentials from brand_integrations
  const integrationType = routePlatform(platform);
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, integrationType)))
    .limit(1);

  if (!integration || !integration.credentials_encrypted) {
    throw new Error(`No ${platform} credentials found for brand ${brandId}`);
  }

  // 4. Decrypt credentials
  const tokens: SocialTokens = JSON.parse(decrypt(integration.credentials_encrypted));

  if (!tokens.access_token) {
    throw new Error(`Missing access_token in ${platform} credentials for brand ${brandId}`);
  }

  // 5. Post via appropriate API client
  let result: SocialPostResult;

  if (platform === 'twitter') {
    const tweet = await postTweet(tokens.access_token, content);
    result = {
      platform: 'twitter',
      post_id: tweet.id,
      url: `https://twitter.com/i/status/${tweet.id}`,
      posted_at: new Date().toISOString(),
    };
  } else {
    // LinkedIn requires an author URN
    const authorUrn = tokens.author_urn || ((integration.config as Record<string, unknown>)?.author_urn as string);
    if (!authorUrn) {
      throw new Error(`Missing author_urn in LinkedIn credentials for brand ${brandId}`);
    }

    const postUrn = await postToLinkedIn(tokens.access_token, authorUrn, content);
    result = {
      platform: 'linkedin',
      post_id: postUrn,
      url: `https://www.linkedin.com/feed/update/${postUrn}`,
      posted_at: new Date().toISOString(),
    };
  }

  // 6. Log result with structured logging
  const elapsed = Date.now() - startTime;
  logger.info(
    {
      jobId,
      brandId,
      platform,
      post_id: result.post_id,
      post_url: result.url,
      recommendation_id,
      elapsed_ms: elapsed,
    },
    'Social post published successfully',
  );
}
