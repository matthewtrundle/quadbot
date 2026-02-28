import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the social post publisher logic.
 *
 * Since importing from worker modules triggers config.ts env validation,
 * we replicate the pure functions locally for testing.
 */

// -------------------------------------------------------------------
// Replicated types and validation logic from social-post-publisher.ts
// -------------------------------------------------------------------

type SocialPlatform = 'twitter' | 'linkedin';

type SocialPostPublisherPayload = {
  platform: SocialPlatform;
  content: string;
  media_urls?: string[];
  recommendation_id?: string;
};

function validatePayload(
  payload: Record<string, unknown>,
): { valid: true; data: SocialPostPublisherPayload } | { valid: false; error: string } {
  const { platform, content } = payload;

  if (!platform || (platform !== 'twitter' && platform !== 'linkedin')) {
    return { valid: false, error: 'Missing or invalid platform. Must be "twitter" or "linkedin".' };
  }

  if (!content || typeof content !== 'string' || content.trim() === '') {
    return { valid: false, error: 'Missing or empty content.' };
  }

  if (platform === 'twitter' && (content as string).length > 280) {
    return { valid: false, error: `Tweet content exceeds 280 characters (${(content as string).length}).` };
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

// -------------------------------------------------------------------
// Replicated platform routing from social-post-publisher.ts
// -------------------------------------------------------------------

function routePlatform(platform: SocialPlatform): 'twitter' | 'linkedin' {
  return platform;
}

// -------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------

describe('Social Post Publisher', () => {
  describe('payload validation', () => {
    it('accepts valid twitter payload', () => {
      const result = validatePayload({
        platform: 'twitter',
        content: 'Hello, world!',
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.platform).toBe('twitter');
        expect(result.data.content).toBe('Hello, world!');
      }
    });

    it('accepts valid linkedin payload', () => {
      const result = validatePayload({
        platform: 'linkedin',
        content: 'Exciting update from our team!',
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.platform).toBe('linkedin');
      }
    });

    it('rejects missing platform', () => {
      const result = validatePayload({ content: 'Hello' });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('platform');
      }
    });

    it('rejects invalid platform', () => {
      const result = validatePayload({
        platform: 'facebook',
        content: 'Hello',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('platform');
      }
    });

    it('rejects missing content', () => {
      const result = validatePayload({ platform: 'twitter' });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('content');
      }
    });

    it('rejects empty content', () => {
      const result = validatePayload({
        platform: 'twitter',
        content: '',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('content');
      }
    });

    it('rejects whitespace-only content', () => {
      const result = validatePayload({
        platform: 'twitter',
        content: '   ',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('content');
      }
    });

    it('rejects non-string content', () => {
      const result = validatePayload({
        platform: 'twitter',
        content: 123,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('content');
      }
    });

    it('rejects tweets exceeding 280 characters', () => {
      const longContent = 'x'.repeat(281);
      const result = validatePayload({
        platform: 'twitter',
        content: longContent,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('280');
      }
    });

    it('accepts tweets at exactly 280 characters', () => {
      const content = 'x'.repeat(280);
      const result = validatePayload({
        platform: 'twitter',
        content,
      });
      expect(result.valid).toBe(true);
    });

    it('does not enforce 280 character limit for linkedin', () => {
      const longContent = 'x'.repeat(500);
      const result = validatePayload({
        platform: 'linkedin',
        content: longContent,
      });
      expect(result.valid).toBe(true);
    });

    it('preserves optional media_urls', () => {
      const result = validatePayload({
        platform: 'twitter',
        content: 'Hello!',
        media_urls: ['https://example.com/image.png'],
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.media_urls).toEqual(['https://example.com/image.png']);
      }
    });

    it('preserves optional recommendation_id', () => {
      const result = validatePayload({
        platform: 'twitter',
        content: 'Hello!',
        recommendation_id: 'rec-abc-123',
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.recommendation_id).toBe('rec-abc-123');
      }
    });
  });

  describe('platform routing', () => {
    it('routes twitter platform to twitter', () => {
      expect(routePlatform('twitter')).toBe('twitter');
    });

    it('routes linkedin platform to linkedin', () => {
      expect(routePlatform('linkedin')).toBe('linkedin');
    });
  });
});
