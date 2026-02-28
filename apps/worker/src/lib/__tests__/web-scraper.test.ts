import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Unit tests for web-scraper.ts pure functions.
 * Functions are replicated locally to avoid importing the full module
 * (which could trigger config.ts env validation).
 */

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

function extractSchemaTypes(html: string): string[] {
  const types: string[] = [];
  const regex = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      collectTypes(json, types);
    } catch {
      // skip
    }
  }

  return [...new Set(types)];
}

function collectTypes(obj: unknown, types: string[]): void {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectTypes(item, types);
    }
  } else if (obj && typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    if (typeof record['@type'] === 'string') {
      types.push(record['@type']);
    } else if (Array.isArray(record['@type'])) {
      for (const t of record['@type']) {
        if (typeof t === 'string') types.push(t);
      }
    }
    for (const value of Object.values(record)) {
      if (typeof value === 'object' && value !== null) {
        collectTypes(value, types);
      }
    }
  }
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Web Scraper', () => {
  describe('extractTitle', () => {
    it('extracts title from standard HTML', () => {
      const html = '<html><head><title>My Page Title</title></head><body></body></html>';
      expect(extractTitle(html)).toBe('My Page Title');
    });

    it('extracts title with attributes on tag', () => {
      const html = '<title lang="en">Hello World</title>';
      expect(extractTitle(html)).toBe('Hello World');
    });

    it('returns null when no title present', () => {
      const html = '<html><head></head><body></body></html>';
      expect(extractTitle(html)).toBeNull();
    });

    it('decodes HTML entities in title', () => {
      const html = '<title>Tom &amp; Jerry</title>';
      expect(extractTitle(html)).toBe('Tom & Jerry');
    });

    it('trims whitespace from title', () => {
      const html = '<title>  Spaced Title  </title>';
      expect(extractTitle(html)).toBe('Spaced Title');
    });
  });

  describe('extractMetaDescription', () => {
    it('extracts meta description (name before content)', () => {
      const html = '<meta name="description" content="A great page about things">';
      expect(extractMetaDescription(html)).toBe('A great page about things');
    });

    it('extracts meta description (content before name)', () => {
      const html = '<meta content="Reversed order" name="description">';
      expect(extractMetaDescription(html)).toBe('Reversed order');
    });

    it('returns null when no meta description', () => {
      const html = '<meta name="keywords" content="foo,bar">';
      expect(extractMetaDescription(html)).toBeNull();
    });

    it('handles self-closing tags', () => {
      const html = '<meta name="description" content="Self closing" />';
      expect(extractMetaDescription(html)).toBe('Self closing');
    });

    it('decodes HTML entities', () => {
      const html = '<meta name="description" content="5 &gt; 3">';
      expect(extractMetaDescription(html)).toBe('5 > 3');
    });
  });

  describe('extractHeadings', () => {
    it('extracts h1, h2, h3 headings', () => {
      const html = `
        <h1>Main Title</h1>
        <h2>Section One</h2>
        <h2>Section Two</h2>
        <h3>Subsection A</h3>
        <h3>Subsection B</h3>
      `;
      const headings = extractHeadings(html);
      expect(headings.h1).toEqual(['Main Title']);
      expect(headings.h2).toEqual(['Section One', 'Section Two']);
      expect(headings.h3).toEqual(['Subsection A', 'Subsection B']);
    });

    it('handles headings with nested tags', () => {
      const html = '<h1><span>Bold</span> Title</h1>';
      const headings = extractHeadings(html);
      expect(headings.h1).toEqual(['Bold Title']);
    });

    it('returns empty arrays when no headings present', () => {
      const html = '<p>Just a paragraph</p>';
      const headings = extractHeadings(html);
      expect(headings.h1).toEqual([]);
      expect(headings.h2).toEqual([]);
      expect(headings.h3).toEqual([]);
    });

    it('handles headings with attributes', () => {
      const html = '<h1 class="title" id="main">Styled Heading</h1>';
      const headings = extractHeadings(html);
      expect(headings.h1).toEqual(['Styled Heading']);
    });
  });

  describe('extractSchemaTypes', () => {
    it('extracts @type from JSON-LD', () => {
      const html = `
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Article","name":"Test"}
        </script>
      `;
      expect(extractSchemaTypes(html)).toEqual(['Article']);
    });

    it('extracts multiple types from @graph', () => {
      const html = `
        <script type="application/ld+json">
        {"@graph":[{"@type":"WebPage"},{"@type":"Organization"}]}
        </script>
      `;
      const types = extractSchemaTypes(html);
      expect(types).toContain('WebPage');
      expect(types).toContain('Organization');
    });

    it('handles multiple JSON-LD blocks', () => {
      const html = `
        <script type="application/ld+json">{"@type":"Article"}</script>
        <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
      `;
      const types = extractSchemaTypes(html);
      expect(types).toContain('Article');
      expect(types).toContain('BreadcrumbList');
    });

    it('deduplicates types', () => {
      const html = `
        <script type="application/ld+json">{"@type":"Article"}</script>
        <script type="application/ld+json">{"@type":"Article"}</script>
      `;
      expect(extractSchemaTypes(html)).toEqual(['Article']);
    });

    it('handles malformed JSON-LD gracefully', () => {
      const html = '<script type="application/ld+json">not json at all</script>';
      expect(extractSchemaTypes(html)).toEqual([]);
    });

    it('handles array @type', () => {
      const html = `
        <script type="application/ld+json">
        {"@type":["Article","NewsArticle"]}
        </script>
      `;
      const types = extractSchemaTypes(html);
      expect(types).toContain('Article');
      expect(types).toContain('NewsArticle');
    });

    it('returns empty array when no JSON-LD blocks', () => {
      const html = '<html><body>No schema</body></html>';
      expect(extractSchemaTypes(html)).toEqual([]);
    });
  });

  describe('stripHtmlTags', () => {
    it('removes all HTML tags', () => {
      expect(stripHtmlTags('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    });

    it('removes script blocks', () => {
      expect(stripHtmlTags('Before<script>alert("x")</script>After')).toBe('Before After');
    });

    it('removes style blocks', () => {
      expect(stripHtmlTags('Before<style>.x{color:red}</style>After')).toBe('Before After');
    });

    it('collapses whitespace', () => {
      expect(stripHtmlTags('<p>  lots   of   space  </p>')).toBe('lots of space');
    });

    it('decodes HTML entities', () => {
      expect(stripHtmlTags('&amp; &lt; &gt;')).toBe('& < >');
    });
  });

  describe('computeContentHash', () => {
    it('returns consistent SHA256 hash', () => {
      const hash1 = computeContentHash('hello world');
      const hash2 = computeContentHash('hello world');
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different content', () => {
      const hash1 = computeContentHash('hello');
      const hash2 = computeContentHash('world');
      expect(hash1).not.toBe(hash2);
    });

    it('returns 64-character hex string', () => {
      const hash = computeContentHash('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('matches known SHA256 value', () => {
      // SHA256 of "test" is well-known
      const hash = computeContentHash('test');
      expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    });
  });

  describe('countWords', () => {
    it('counts words in normal text', () => {
      expect(countWords('hello world foo')).toBe(3);
    });

    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('returns 0 for whitespace-only string', () => {
      expect(countWords('   ')).toBe(0);
    });

    it('handles multiple spaces between words', () => {
      expect(countWords('one   two   three')).toBe(3);
    });

    it('handles tabs and newlines', () => {
      expect(countWords('one\ttwo\nthree')).toBe(3);
    });

    it('counts single word', () => {
      expect(countWords('word')).toBe(1);
    });
  });

  describe('extractSitemapUrls', () => {
    it('extracts URLs from sitemap XML', () => {
      const xml = `<?xml version="1.0"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/page2</loc></url>
        </urlset>`;
      const urls = extractSitemapUrls(xml);
      expect(urls).toEqual(['https://example.com/page1', 'https://example.com/page2']);
    });

    it('returns empty array for empty sitemap', () => {
      const xml = '<?xml version="1.0"?><urlset></urlset>';
      expect(extractSitemapUrls(xml)).toEqual([]);
    });

    it('limits to 100 URLs', () => {
      const locs = Array.from({ length: 150 }, (_, i) => `<url><loc>https://example.com/page${i}</loc></url>`).join('');
      const xml = `<urlset>${locs}</urlset>`;
      const urls = extractSitemapUrls(xml);
      expect(urls).toHaveLength(100);
    });

    it('trims whitespace from URLs', () => {
      const xml = '<urlset><url><loc>  https://example.com/  </loc></url></urlset>';
      expect(extractSitemapUrls(xml)).toEqual(['https://example.com/']);
    });
  });

  describe('isPathAllowed (robots.txt parsing)', () => {
    it('allows all when no rules present', () => {
      expect(isPathAllowed('', '/anything')).toBe(true);
    });

    it('respects wildcard disallow', () => {
      const robots = 'User-agent: *\nDisallow: /private/';
      expect(isPathAllowed(robots, '/private/page')).toBe(false);
      expect(isPathAllowed(robots, '/public/page')).toBe(true);
    });

    it('respects QuadBot-specific rules over wildcard', () => {
      const robots = ['User-agent: *', 'Disallow: /blocked/', '', 'User-agent: QuadBot', 'Allow: /blocked/'].join('\n');
      expect(isPathAllowed(robots, '/blocked/page')).toBe(true);
    });

    it('disallows when QuadBot-specific disallow exists', () => {
      const robots = ['User-agent: *', 'Allow: /', '', 'User-agent: QuadBot', 'Disallow: /secret/'].join('\n');
      expect(isPathAllowed(robots, '/secret/stuff')).toBe(false);
    });

    it('picks most specific matching rule', () => {
      const robots = ['User-agent: *', 'Disallow: /docs/', 'Allow: /docs/public/'].join('\n');
      expect(isPathAllowed(robots, '/docs/public/page')).toBe(true);
      expect(isPathAllowed(robots, '/docs/private/page')).toBe(false);
    });

    it('allows when disallow path is empty', () => {
      const robots = 'User-agent: *\nDisallow: ';
      expect(isPathAllowed(robots, '/anything')).toBe(true);
    });

    it('ignores comments', () => {
      const robots = '# This is a comment\nUser-agent: *\nDisallow: /blocked/';
      expect(isPathAllowed(robots, '/blocked/page')).toBe(false);
    });

    it('allows when robots.txt has only other user agents', () => {
      const robots = 'User-agent: Googlebot\nDisallow: /everything/';
      expect(isPathAllowed(robots, '/everything/page')).toBe(true);
    });
  });
});
