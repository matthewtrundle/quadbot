import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the tryGenerateGscAction logic used in action-draft-generator.ts.
 * Tests the pure GSC action mapping logic without requiring database access.
 */

// Replicated from action-draft-generator.ts (private function)
function tryGenerateGscAction(source: string, data: Record<string, unknown>) {
  if (source !== 'gsc_daily_digest') return null;

  const recType = data.type as string;
  if (!recType) return null;

  const pageUrl = (data.page_url || data.url) as string | undefined;

  switch (recType) {
    case 'not_indexed':
    case 'page_not_indexed':
    case 'indexing_issue':
    case 'new_page':
    case 'content_updated':
      if (!pageUrl) return null;
      return {
        type: 'gsc-index-request',
        payload: { url: pageUrl, action: 'URL_UPDATED' },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    case 'crawl_error':
    case 'crawl_issue':
    case 'page_error':
    case 'fetch_error':
    case 'redirect_error':
      if (!pageUrl) return null;
      return {
        type: 'gsc-inspection',
        payload: { url: pageUrl },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    case 'sitemap_issue':
    case 'sitemap_error':
    case 'sitemap_missing':
    case 'sitemap_outdated':
      return {
        type: 'gsc-sitemap-notify',
        payload: { sitemapUrl: (data.sitemap_url as string) || undefined },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    case 'deleted_page':
    case 'page_removed':
      if (!pageUrl) return null;
      return {
        type: 'gsc-index-request',
        payload: { url: pageUrl, action: 'URL_DELETED' },
        risk: 'medium',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      };

    default:
      return null;
  }
}

describe('Action Draft Generator - tryGenerateGscAction', () => {
  describe('source filtering', () => {
    it('returns null for non-gsc sources', () => {
      expect(tryGenerateGscAction('community_moderation', { type: 'not_indexed', page_url: 'https://example.com' })).toBeNull();
      expect(tryGenerateGscAction('trend_scan', { type: 'not_indexed', page_url: 'https://example.com' })).toBeNull();
      expect(tryGenerateGscAction('', { type: 'not_indexed', page_url: 'https://example.com' })).toBeNull();
    });

    it('returns null when no type in data', () => {
      expect(tryGenerateGscAction('gsc_daily_digest', {})).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { page_url: 'https://example.com' })).toBeNull();
    });
  });

  describe('index request actions (URL_UPDATED)', () => {
    it('maps not_indexed to gsc-index-request with URL_UPDATED', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'not_indexed', page_url: 'https://example.com/page' });
      expect(result).toEqual({
        type: 'gsc-index-request',
        payload: { url: 'https://example.com/page', action: 'URL_UPDATED' },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      });
    });

    it('maps page_not_indexed to gsc-index-request', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'page_not_indexed', page_url: 'https://example.com/new' });
      expect(result?.type).toBe('gsc-index-request');
      expect(result?.payload).toEqual({ url: 'https://example.com/new', action: 'URL_UPDATED' });
    });

    it('returns null when pageUrl is missing for index request types', () => {
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'not_indexed' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'indexing_issue' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'new_page' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'content_updated' })).toBeNull();
    });
  });

  describe('inspection actions', () => {
    it('maps crawl_error to gsc-inspection', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'crawl_error', page_url: 'https://example.com/broken' });
      expect(result).toEqual({
        type: 'gsc-inspection',
        payload: { url: 'https://example.com/broken' },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      });
    });

    it('maps all error types to gsc-inspection', () => {
      const errorTypes = ['crawl_error', 'crawl_issue', 'page_error', 'fetch_error', 'redirect_error'];
      for (const errorType of errorTypes) {
        const result = tryGenerateGscAction('gsc_daily_digest', { type: errorType, page_url: 'https://example.com/err' });
        expect(result?.type).toBe('gsc-inspection');
      }
    });

    it('returns null when pageUrl is missing for inspection types', () => {
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'crawl_error' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'fetch_error' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'redirect_error' })).toBeNull();
    });
  });

  describe('sitemap actions', () => {
    it('maps sitemap_issue to gsc-sitemap-notify', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'sitemap_issue', sitemap_url: 'https://example.com/sitemap.xml' });
      expect(result).toEqual({
        type: 'gsc-sitemap-notify',
        payload: { sitemapUrl: 'https://example.com/sitemap.xml' },
        risk: 'low',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      });
    });

    it('maps all sitemap types to gsc-sitemap-notify', () => {
      const sitemapTypes = ['sitemap_issue', 'sitemap_error', 'sitemap_missing', 'sitemap_outdated'];
      for (const sitemapType of sitemapTypes) {
        const result = tryGenerateGscAction('gsc_daily_digest', { type: sitemapType });
        expect(result?.type).toBe('gsc-sitemap-notify');
      }
    });

    it('does not require pageUrl for sitemap actions', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'sitemap_issue' });
      expect(result).not.toBeNull();
      expect(result?.payload).toEqual({ sitemapUrl: undefined });
    });
  });

  describe('delete actions', () => {
    it('maps deleted_page to gsc-index-request with URL_DELETED and medium risk', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'deleted_page', page_url: 'https://example.com/old' });
      expect(result).toEqual({
        type: 'gsc-index-request',
        payload: { url: 'https://example.com/old', action: 'URL_DELETED' },
        risk: 'medium',
        guardrails_applied: { auto_generated: true, source: 'gsc_daily_digest' },
        requires_approval: true,
      });
    });

    it('maps page_removed to gsc-index-request with URL_DELETED', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'page_removed', url: 'https://example.com/removed' });
      expect(result?.type).toBe('gsc-index-request');
      expect(result?.payload).toEqual({ url: 'https://example.com/removed', action: 'URL_DELETED' });
      expect(result?.risk).toBe('medium');
    });

    it('returns null when pageUrl is missing for delete types', () => {
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'deleted_page' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'page_removed' })).toBeNull();
    });
  });

  describe('URL field resolution', () => {
    it('supports page_url field', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'not_indexed', page_url: 'https://example.com/a' });
      expect(result?.payload).toEqual({ url: 'https://example.com/a', action: 'URL_UPDATED' });
    });

    it('supports url field as fallback', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'not_indexed', url: 'https://example.com/b' });
      expect(result?.payload).toEqual({ url: 'https://example.com/b', action: 'URL_UPDATED' });
    });

    it('prefers page_url over url when both are present', () => {
      const result = tryGenerateGscAction('gsc_daily_digest', { type: 'not_indexed', page_url: 'https://example.com/preferred', url: 'https://example.com/fallback' });
      expect(result?.payload).toEqual({ url: 'https://example.com/preferred', action: 'URL_UPDATED' });
    });
  });

  describe('unknown types', () => {
    it('returns null for unknown rec types', () => {
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'unknown_type', page_url: 'https://example.com' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'performance_drop', page_url: 'https://example.com' })).toBeNull();
      expect(tryGenerateGscAction('gsc_daily_digest', { type: 'keyword_ranking', page_url: 'https://example.com' })).toBeNull();
    });
  });
});
