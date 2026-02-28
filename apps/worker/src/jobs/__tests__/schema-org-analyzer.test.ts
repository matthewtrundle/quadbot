import { describe, it, expect } from 'vitest';

/**
 * Unit tests for Schema.org Analyzer job logic.
 *
 * Pure functions are replicated locally to avoid importing from modules
 * that trigger config.ts env validation.
 */

// --- Replicated types and functions ---

type SchemaOrgMarkup = {
  format: 'json-ld' | 'microdata' | 'rdfa';
  types: string[];
  properties: Record<string, unknown>;
  raw: string;
  issues: string[];
};

const PAGE_TYPE_SCHEMAS: Record<string, string[]> = {
  blog: ['Article', 'BlogPosting', 'NewsArticle'],
  product: ['Product'],
  homepage: ['Organization', 'WebSite', 'WebPage'],
  about: ['Organization', 'Person', 'AboutPage'],
  contact: ['LocalBusiness', 'ContactPoint', 'Organization'],
  other: [],
};

function inferPageType(url: string, title: string | null): string {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }

  const titleLower = (title || '').toLowerCase();

  if (/^\/(blog|post|posts|article|articles|news)(\/|$)/.test(path)) return 'blog';
  if (titleLower.includes('blog') && path !== '/') return 'blog';

  if (/^\/(product|products|shop|store|item)(\/|$)/.test(path)) return 'product';

  if (/^\/about/.test(path)) return 'about';
  if (titleLower.includes('about us')) return 'about';

  if (/^\/contact/.test(path)) return 'contact';
  if (titleLower.includes('contact us')) return 'contact';

  if (path === '/' || path === '/home' || path === '/home/' || path === '') return 'homepage';

  return 'other';
}

function validateSchemaForPage(schemas: SchemaOrgMarkup[], pageType: string): string[] {
  const issues: string[] = [];
  const recommendedTypes = PAGE_TYPE_SCHEMAS[pageType] || [];
  if (recommendedTypes.length === 0) return issues;

  const foundTypes = new Set<string>();
  for (const schema of schemas) {
    for (const type of schema.types) {
      foundTypes.add(type);
    }
  }

  const hasRecommended = recommendedTypes.some((t) => foundTypes.has(t));

  if (!hasRecommended && schemas.length === 0) {
    issues.push(
      'No Schema.org markup found. For a ' + pageType + ' page, consider adding: ' + recommendedTypes.join(', '),
    );
  } else if (!hasRecommended) {
    issues.push(
      'Missing recommended schema types for ' + pageType + ' page. Consider adding: ' + recommendedTypes.join(', '),
    );
  }

  if (pageType === 'product') {
    const productSchemas = schemas.filter((s) => s.types.includes('Product'));
    for (const ps of productSchemas) {
      if (!ps.properties.offers && !ps.properties.price) {
        issues.push('Product schema is missing pricing information (offers or price)');
      }
      if (!ps.properties.availability) {
        const offers = ps.properties.offers;
        const hasAvailability =
          offers && typeof offers === 'object' && 'availability' in (offers as Record<string, unknown>);
        if (!hasAvailability) {
          issues.push('Product schema is missing availability information');
        }
      }
    }
  }

  if (pageType === 'blog') {
    const articleSchemas = schemas.filter(
      (s) => s.types.includes('Article') || s.types.includes('BlogPosting') || s.types.includes('NewsArticle'),
    );
    for (const as_ of articleSchemas) {
      if (!as_.properties.datePublished) {
        issues.push('Article/BlogPosting is missing datePublished');
      }
      if (!as_.properties.author) {
        issues.push('Article/BlogPosting is missing author');
      }
    }
  }

  if (pageType === 'homepage') {
    const hasOrg = schemas.some((s) => s.types.includes('Organization'));
    const hasWebSite = schemas.some((s) => s.types.includes('WebSite'));
    if (!hasOrg && !hasWebSite) {
      issues.push('Homepage should include Organization or WebSite schema');
    }
  }

  return issues;
}

/**
 * Determine overall schema health based on analysis.
 * Replicated scoring logic for testing.
 */
function calculateSchemaScore(pagesAnalyzed: number, pagesWithSchema: number, totalIssues: number): number {
  if (pagesAnalyzed === 0) return 0;
  const coverageScore = (pagesWithSchema / pagesAnalyzed) * 60;
  const issuesPenalty = Math.min(totalIssues * 2, 40);
  return Math.max(0, Math.round(coverageScore + (40 - issuesPenalty)));
}

// --- Tests ---

describe('Schema.org Analyzer', () => {
  describe('page type inference for analysis', () => {
    it('correctly infers types for a diverse set of site URLs', () => {
      const urls = [
        { url: 'https://example.com/', expected: 'homepage' },
        { url: 'https://example.com/blog/2024/my-post', expected: 'blog' },
        { url: 'https://example.com/products/widget-pro', expected: 'product' },
        { url: 'https://example.com/about', expected: 'about' },
        { url: 'https://example.com/contact', expected: 'contact' },
        { url: 'https://example.com/pricing', expected: 'other' },
        { url: 'https://example.com/shop/deals', expected: 'product' },
        { url: 'https://example.com/news/update', expected: 'blog' },
      ];

      for (const { url, expected } of urls) {
        expect(inferPageType(url, null)).toBe(expected);
      }
    });

    it('handles pages with titles when URL is ambiguous', () => {
      expect(inferPageType('https://example.com/team', 'About Us — Our Team')).toBe('about');
      expect(inferPageType('https://example.com/reach-out', 'Contact Us')).toBe('contact');
      expect(inferPageType('https://example.com/insights/idea', 'Our Blog — Insights')).toBe('blog');
    });

    it('homepage detection for various forms', () => {
      expect(inferPageType('https://example.com/', null)).toBe('homepage');
      expect(inferPageType('https://example.com/home', null)).toBe('homepage');
      expect(inferPageType('https://example.com/home/', null)).toBe('homepage');
    });
  });

  describe('schema completeness checking', () => {
    it('identifies pages missing all schema markup', () => {
      const issues = validateSchemaForPage([], 'blog');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toContain('No Schema.org markup found');
    });

    it('identifies when wrong schema type is used', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Organization'],
          properties: { name: 'Acme', url: 'https://acme.com' },
          raw: '{}',
          issues: [],
        },
      ];

      // Organization on a blog page is wrong type
      const issues = validateSchemaForPage(schemas, 'blog');
      expect(issues.some((i) => i.includes('Missing recommended schema types'))).toBe(true);
    });

    it('validates product pages need pricing', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Product'],
          properties: { name: 'Widget', description: 'Great' },
          raw: '{}',
          issues: [],
        },
      ];

      const issues = validateSchemaForPage(schemas, 'product');
      expect(issues.some((i) => i.includes('pricing'))).toBe(true);
      expect(issues.some((i) => i.includes('availability'))).toBe(true);
    });

    it('does not flag product with offers', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Product'],
          properties: {
            name: 'Widget',
            description: 'Great',
            offers: { price: '29.99', availability: 'InStock' },
          },
          raw: '{}',
          issues: [],
        },
      ];

      const issues = validateSchemaForPage(schemas, 'product');
      expect(issues.some((i) => i.includes('pricing'))).toBe(false);
    });

    it('validates blog articles need author and date', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['BlogPosting'],
          properties: { headline: 'Test' },
          raw: '{}',
          issues: [],
        },
      ];

      const issues = validateSchemaForPage(schemas, 'blog');
      expect(issues.some((i) => i.includes('datePublished'))).toBe(true);
      expect(issues.some((i) => i.includes('author'))).toBe(true);
    });

    it('does not flag complete blog article', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['BlogPosting'],
          properties: {
            headline: 'Test',
            author: 'Alice',
            datePublished: '2024-01-15',
          },
          raw: '{}',
          issues: [],
        },
      ];

      const issues = validateSchemaForPage(schemas, 'blog');
      expect(issues.some((i) => i.includes('datePublished'))).toBe(false);
      expect(issues.some((i) => i.includes('author'))).toBe(false);
    });

    it('validates homepage needs Organization or WebSite', () => {
      const issues = validateSchemaForPage([], 'homepage');
      expect(issues.some((i) => i.includes('Organization') || i.includes('WebSite'))).toBe(true);
    });

    it('accepts homepage with WebSite schema', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['WebSite'],
          properties: { name: 'Acme', url: 'https://acme.com' },
          raw: '{}',
          issues: [],
        },
      ];

      const issues = validateSchemaForPage(schemas, 'homepage');
      expect(issues.some((i) => i.includes('Homepage should include'))).toBe(false);
    });

    it('ignores validation for "other" page types', () => {
      const issues = validateSchemaForPage([], 'other');
      expect(issues).toHaveLength(0);
    });
  });

  describe('schema score calculation', () => {
    it('returns 100 for perfect coverage with no issues', () => {
      const score = calculateSchemaScore(10, 10, 0);
      expect(score).toBe(100);
    });

    it('returns 0 for no pages analyzed', () => {
      const score = calculateSchemaScore(0, 0, 0);
      expect(score).toBe(0);
    });

    it('reduces score for missing schema coverage', () => {
      const fullCoverage = calculateSchemaScore(10, 10, 0);
      const halfCoverage = calculateSchemaScore(10, 5, 0);
      expect(halfCoverage).toBeLessThan(fullCoverage);
    });

    it('reduces score for issues', () => {
      const noIssues = calculateSchemaScore(10, 10, 0);
      const withIssues = calculateSchemaScore(10, 10, 5);
      expect(withIssues).toBeLessThan(noIssues);
    });

    it('does not go below 0', () => {
      const score = calculateSchemaScore(10, 0, 100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('handles partial coverage with moderate issues', () => {
      // 7 out of 10 pages with schema, 8 issues
      const score = calculateSchemaScore(10, 7, 8);
      // Coverage: (7/10) * 60 = 42, Issues penalty: min(16, 40) = 16, Score: 42 + (40-16) = 66
      expect(score).toBe(66);
    });
  });

  describe('fallback URL generation', () => {
    it('generates standard pages from base URL', () => {
      function generateFallbackUrls(siteUrl: string): string[] {
        const baseUrl = siteUrl.replace(/\/$/, '');
        return [
          baseUrl,
          baseUrl + '/about',
          baseUrl + '/contact',
          baseUrl + '/blog',
          baseUrl + '/products',
          baseUrl + '/services',
        ];
      }

      const urls = generateFallbackUrls('https://example.com/');
      expect(urls).toHaveLength(6);
      expect(urls[0]).toBe('https://example.com');
      expect(urls).toContain('https://example.com/about');
      expect(urls).toContain('https://example.com/contact');
      expect(urls).toContain('https://example.com/blog');
    });

    it('handles base URL without trailing slash', () => {
      function generateFallbackUrls(siteUrl: string): string[] {
        const baseUrl = siteUrl.replace(/\/$/, '');
        return [
          baseUrl,
          baseUrl + '/about',
          baseUrl + '/contact',
          baseUrl + '/blog',
          baseUrl + '/products',
          baseUrl + '/services',
        ];
      }

      const urls = generateFallbackUrls('https://example.com');
      expect(urls[0]).toBe('https://example.com');
      expect(urls[1]).toBe('https://example.com/about');
    });
  });

  describe('title extraction', () => {
    it('extracts title from HTML', () => {
      function extractTitle(html: string): string | null {
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return match ? match[1].trim() : null;
      }

      expect(extractTitle('<html><head><title>My Page</title></head></html>')).toBe('My Page');
      expect(extractTitle('<title>  Spaced Title  </title>')).toBe('Spaced Title');
      expect(extractTitle('<html><body>No title</body></html>')).toBeNull();
    });
  });
});
