/**
 * Shared types for social media posting
 */

export type SocialPlatform = 'twitter' | 'linkedin';

export type SocialPostResult = {
  platform: SocialPlatform;
  post_id: string;
  url: string;
  posted_at: string;
};

export type SocialPostPayload = {
  platform: SocialPlatform;
  content: string;
  media_urls?: string[];
};
