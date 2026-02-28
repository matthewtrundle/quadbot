/**
 * Social Post Executor
 *
 * Action executor that publishes social media posts via Twitter or LinkedIn APIs.
 * Extracts platform and content from the action draft payload and calls the
 * appropriate social API client.
 */

import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { brandIntegrations, decrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { postTweet } from '../lib/social/twitter-api.js';
import { postToLinkedIn } from '../lib/social/linkedin-api.js';
import type { SocialPlatform } from '../lib/social/types.js';
import { logger } from '../logger.js';

export interface SocialPostPayload {
  platform: SocialPlatform;
  content: string;
  media_urls?: string[];
  author_urn?: string; // LinkedIn author URN override
}

type SocialTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  author_urn?: string;
};

export const socialPostExecutor: Executor = {
  type: 'social-post',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const { platform, content, author_urn } = payload as unknown as SocialPostPayload;

    if (!platform || (platform !== 'twitter' && platform !== 'linkedin')) {
      return {
        success: false,
        error: 'Missing or invalid platform. Must be "twitter" or "linkedin".',
      };
    }

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return {
        success: false,
        error: 'Missing or empty content.',
      };
    }

    logger.info({ brandId, actionDraftId, platform, contentLength: content.length }, 'Executing social post');

    try {
      // Load platform credentials from brand_integrations
      const [integration] = await db
        .select()
        .from(brandIntegrations)
        .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, platform)))
        .limit(1);

      if (!integration || !integration.credentials_encrypted) {
        return {
          success: false,
          error: `No ${platform} credentials found for brand`,
        };
      }

      const tokens: SocialTokens = JSON.parse(decrypt(integration.credentials_encrypted));

      if (!tokens.access_token) {
        return {
          success: false,
          error: `Missing access_token in ${platform} credentials`,
        };
      }

      if (platform === 'twitter') {
        const tweet = await postTweet(tokens.access_token, content);

        logger.info({ brandId, actionDraftId, tweetId: tweet.id }, 'Tweet posted successfully');

        return {
          success: true,
          result: {
            platform: 'twitter',
            post_id: tweet.id,
            url: `https://twitter.com/i/status/${tweet.id}`,
            posted_at: new Date().toISOString(),
          },
        };
      } else {
        // LinkedIn
        const resolvedAuthorUrn =
          author_urn || tokens.author_urn || ((integration.config as Record<string, unknown>)?.author_urn as string);

        if (!resolvedAuthorUrn) {
          return {
            success: false,
            error: 'Missing author_urn for LinkedIn post',
          };
        }

        const postUrn = await postToLinkedIn(tokens.access_token, resolvedAuthorUrn, content);

        logger.info({ brandId, actionDraftId, postUrn }, 'LinkedIn post published successfully');

        return {
          success: true,
          result: {
            platform: 'linkedin',
            post_id: postUrn,
            url: `https://www.linkedin.com/feed/update/${postUrn}`,
            posted_at: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ brandId, actionDraftId, platform, error: errorMessage }, 'Social post execution failed');

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};
