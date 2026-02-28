import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Unit tests for competitor-monitor.ts pure functions.
 * Functions are replicated locally to avoid importing the full job module
 * (which triggers config.ts env validation).
 */

// ─── Replicated Types ───────────────────────────────────────────────────────

type ScrapedPage = {
  url: string;
  title: string | null;
  meta_description: string | null;
  content_hash: string;
  word_count: number;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  schema_types: string[];
};

// ─── Replicated Functions ───────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)));
}

function stripHtmlTags(html: string): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeHtmlEntities(text);
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(
    /<meta\s+[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*\/?>/i,
  );
  if (match) return decodeHtmlEntities(match[1].trim());

  const match2 = html.match(
    /<meta\s+[^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*name\s*=\s*["']description["'][^>]*\/?>/i,
  );
  return match2 ? decodeHtmlEntities(match2[1].trim()) : null;
}

function extractHeadings(html: string): { h1: string[]; h2: string[]; h3: string[] } {
  const extract = (tag: string): string[] => {
    const results: string[] = [];
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const text = stripHtmlTags(match[1]).trim();
      if (text) results.push(text);
    }
    return results;
  };

  return {
    h1: extract('h1'),
    h2: extract('h2'),
    h3: extract('h3'),
  };
}

function computeContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null && urls.length < 100) {
    const url = match[1].trim();
    if (url) urls.push(url);
  }

  return urls;
}

function isPathAllowed(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split('\n').map((l) => l.trim());

  const quadbotRules: Array<{ type: 'allow' | 'disallow'; path: string }> = [];
  const wildcardRules: Array<{ type: 'allow' | 'disallow'; path: string }> = [];

  let currentAgent: 'quadbot' | 'wildcard' | 'other' | null = null;

  for (const line of lines) {
    if (line.startsWith('#') || !line) continue;

    const agentMatch = line.match(/^user-agent\s*:\s*(.+)$/i);
    if (agentMatch) {
      const agent = agentMatch[1].trim().toLowerCase();
      if (agent === 'quadbot' || agent === 'quadbot/1.0') {
        currentAgent = 'quadbot';
      } else if (agent === '*') {
        currentAgent = 'wildcard';
      } else {
        currentAgent = 'other';
      }
      continue;
    }

    if (!currentAgent || currentAgent === 'other') continue;

    const ruleMatch = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
    if (ruleMatch) {
      const type = ruleMatch[1].toLowerCase() as 'allow' | 'disallow';
      const rulePath = ruleMatch[2].trim();

      const rules = currentAgent === 'quadbot' ? quadbotRules : wildcardRules;
      rules.push({ type, path: rulePath });
    }
  }

  const applicableRules = quadbotRules.length > 0 ? quadbotRules : wildcardRules;

  if (applicableRules.length === 0) return true;

  let bestMatch: { type: 'allow' | 'disallow'; path: string } | null = null;
  let bestLength = -1;

  for (const rule of applicableRules) {
    if (rule.path === '' && rule.type === 'disallow') {
      continue;
    }
    if (path.startsWith(rule.path) && rule.path.length > bestLength) {
      bestMatch = rule;
      bestLength = rule.path.length;
    }
  }

  if (!bestMatch) return true;
  return bestMatch.type === 'allow';
}

/**
 * Detect changes between current scraped pages and previous snapshots.
 */
function detectChanges(
  currentPages: ScrapedPage[],
  previousSnapshots: Array<{ page_url: string; content_hash: string | null }>,
): {
  newPages: ScrapedPage[];
  changedPages: Array<{ current: ScrapedPage; previous_hash: string }>;
  removedUrls: string[];
} {
  const previousByUrl = new Map(previousSnapshots.map((s) => [s.page_url, s.content_hash]));
  const currentUrls = new Set(currentPages.map((p) => p.url));

  const newPages: ScrapedPage[] = [];
  const changedPages: Array<{ current: ScrapedPage; previous_hash: string }> = [];

  for (const page of currentPages) {
    const prevHash = previousByUrl.get(page.url);
    if (prevHash === undefined) {
      newPages.push(page);
    } else if (prevHash !== null && prevHash !== page.content_hash) {
      changedPages.push({ current: page, previous_hash: prevHash });
    }
  }

  const removedUrls = previousSnapshots.filter((s) => !currentUrls.has(s.page_url)).map((s) => s.page_url);

  return { newPages, changedPages, removedUrls };
}

// ─── Helper: create a mock ScrapedPage ──────────────────────────────────────

function makePage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
  return {
    url: 'https://example.com/page',
    title: 'Test Page',
    meta_description: 'A test page',
    content_hash: 'abc123',
    word_count: 100,
    headings: { h1: ['Test'], h2: [], h3: [] },
    schema_types: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Competitor Monitor', () => {
  describe('HTML title extraction', () => {
    it('extracts title from HTML page', () => {
      const html = '<html><head><title>Competitor Page</title></head></html>';
      expect(extractTitle(html)).toBe('Competitor Page');
    });

    it('returns null for missing title', () => {
      expect(extractTitle('<html><head></head></html>')).toBeNull();
    });

    it('handles HTML entities in title', () => {
      expect(extractTitle('<title>A &amp; B</title>')).toBe('A & B');
    });
  });

  describe('meta description extraction', () => {
    it('extracts meta description', () => {
      const html = '<meta name="description" content="SEO description here">';
      expect(extractMetaDescription(html)).toBe('SEO description here');
    });

    it('returns null when absent', () => {
      expect(extractMetaDescription('<html></html>')).toBeNull();
    });
  });

  describe('heading extraction', () => {
    it('extracts all heading levels', () => {
      const html = '<h1>Title</h1><h2>Sub</h2><h3>Detail</h3>';
      const h = extractHeadings(html);
      expect(h.h1).toEqual(['Title']);
      expect(h.h2).toEqual(['Sub']);
      expect(h.h3).toEqual(['Detail']);
    });

    it('extracts multiple headings of same level', () => {
      const html = '<h2>First</h2><h2>Second</h2><h2>Third</h2>';
      expect(extractHeadings(html).h2).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('content hash generation', () => {
    it('generates consistent hash for same content', () => {
      const h1 = computeContentHash('competitor content');
      const h2 = computeContentHash('competitor content');
      expect(h1).toBe(h2);
    });

    it('generates different hash for different content', () => {
      const h1 = computeContentHash('content version 1');
      const h2 = computeContentHash('content version 2');
      expect(h1).not.toBe(h2);
    });

    it('returns 64-char hex string', () => {
      const hash = computeContentHash('anything');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('word count', () => {
    it('counts words correctly', () => {
      expect(countWords('one two three four five')).toBe(5);
    });

    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('handles extra whitespace', () => {
      expect(countWords('  one   two  ')).toBe(2);
    });
  });

  describe('sitemap URL extraction', () => {
    it('extracts URLs from sitemap XML', () => {
      const xml = `
        <urlset>
          <url><loc>https://competitor.com/</loc></url>
          <url><loc>https://competitor.com/about</loc></url>
          <url><loc>https://competitor.com/blog</loc></url>
        </urlset>
      `;
      const urls = extractSitemapUrls(xml);
      expect(urls).toHaveLength(3);
      expect(urls[0]).toBe('https://competitor.com/');
      expect(urls[2]).toBe('https://competitor.com/blog');
    });

    it('limits to 100 URLs', () => {
      const locs = Array.from({ length: 200 }, (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`).join('');
      const urls = extractSitemapUrls(`<urlset>${locs}</urlset>`);
      expect(urls).toHaveLength(100);
    });

    it('returns empty for empty sitemap', () => {
      expect(extractSitemapUrls('<urlset></urlset>')).toEqual([]);
    });
  });

  describe('robots.txt parsing', () => {
    it('allows everything when no rules', () => {
      expect(isPathAllowed('', '/anything')).toBe(true);
    });

    it('blocks disallowed paths', () => {
      const robots = 'User-agent: *\nDisallow: /admin/';
      expect(isPathAllowed(robots, '/admin/panel')).toBe(false);
    });

    it('allows non-matching paths', () => {
      const robots = 'User-agent: *\nDisallow: /admin/';
      expect(isPathAllowed(robots, '/blog/post')).toBe(true);
    });

    it('uses QuadBot-specific rules when available', () => {
      const robots = ['User-agent: *', 'Disallow: /', '', 'User-agent: QuadBot', 'Allow: /public/'].join('\n');
      expect(isPathAllowed(robots, '/public/page')).toBe(true);
    });

    it('handles empty disallow (allow all)', () => {
      const robots = 'User-agent: *\nDisallow: ';
      expect(isPathAllowed(robots, '/anything')).toBe(true);
    });
  });

  describe('change detection', () => {
    it('detects new pages', () => {
      const current = [makePage({ url: 'https://comp.com/new', content_hash: 'hash1' })];
      const previous: Array<{ page_url: string; content_hash: string | null }> = [];

      const changes = detectChanges(current, previous);
      expect(changes.newPages).toHaveLength(1);
      expect(changes.newPages[0].url).toBe('https://comp.com/new');
      expect(changes.changedPages).toHaveLength(0);
      expect(changes.removedUrls).toHaveLength(0);
    });

    it('detects changed pages', () => {
      const current = [makePage({ url: 'https://comp.com/page', content_hash: 'new-hash' })];
      const previous = [{ page_url: 'https://comp.com/page', content_hash: 'old-hash' }];

      const changes = detectChanges(current, previous);
      expect(changes.newPages).toHaveLength(0);
      expect(changes.changedPages).toHaveLength(1);
      expect(changes.changedPages[0].current.url).toBe('https://comp.com/page');
      expect(changes.changedPages[0].previous_hash).toBe('old-hash');
    });

    it('detects removed pages', () => {
      const current: ScrapedPage[] = [];
      const previous = [{ page_url: 'https://comp.com/gone', content_hash: 'hash1' }];

      const changes = detectChanges(current, previous);
      expect(changes.removedUrls).toEqual(['https://comp.com/gone']);
      expect(changes.newPages).toHaveLength(0);
      expect(changes.changedPages).toHaveLength(0);
    });

    it('identifies unchanged pages (same hash)', () => {
      const current = [makePage({ url: 'https://comp.com/same', content_hash: 'same-hash' })];
      const previous = [{ page_url: 'https://comp.com/same', content_hash: 'same-hash' }];

      const changes = detectChanges(current, previous);
      expect(changes.newPages).toHaveLength(0);
      expect(changes.changedPages).toHaveLength(0);
      expect(changes.removedUrls).toHaveLength(0);
    });

    it('handles mixed changes correctly', () => {
      const current = [
        makePage({ url: 'https://comp.com/unchanged', content_hash: 'hash-a' }),
        makePage({ url: 'https://comp.com/changed', content_hash: 'hash-new' }),
        makePage({ url: 'https://comp.com/brand-new', content_hash: 'hash-c' }),
      ];
      const previous = [
        { page_url: 'https://comp.com/unchanged', content_hash: 'hash-a' },
        { page_url: 'https://comp.com/changed', content_hash: 'hash-old' },
        { page_url: 'https://comp.com/removed', content_hash: 'hash-d' },
      ];

      const changes = detectChanges(current, previous);
      expect(changes.newPages).toHaveLength(1);
      expect(changes.newPages[0].url).toBe('https://comp.com/brand-new');
      expect(changes.changedPages).toHaveLength(1);
      expect(changes.changedPages[0].current.url).toBe('https://comp.com/changed');
      expect(changes.removedUrls).toEqual(['https://comp.com/removed']);
    });

    it('handles null previous hash as unchanged', () => {
      const current = [makePage({ url: 'https://comp.com/page', content_hash: 'any-hash' })];
      const previous = [{ page_url: 'https://comp.com/page', content_hash: null }];

      const changes = detectChanges(current, previous);
      // null hash means we can't compare, so it's not new and not changed
      expect(changes.newPages).toHaveLength(0);
      expect(changes.changedPages).toHaveLength(0);
    });

    it('handles empty current and previous', () => {
      const changes = detectChanges([], []);
      expect(changes.newPages).toHaveLength(0);
      expect(changes.changedPages).toHaveLength(0);
      expect(changes.removedUrls).toHaveLength(0);
    });
  });
});
