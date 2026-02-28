import { describe, it, expect } from 'vitest';

/**
 * Unit tests for Schema.org structured data parser.
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

const SCHEMA_REQUIRED_PROPERTIES: Record<string, string[]> = {
  Article: ['headline', 'author', 'datePublished'],
  BlogPosting: ['headline', 'author', 'datePublished'],
  Product: ['name', 'description'],
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  Person: ['name'],
  LocalBusiness: ['name', 'address'],
  ContactPoint: ['contactType'],
};

const SCHEMA_RECOMMENDED_PROPERTIES: Record<string, string[]> = {
  Article: ['image', 'dateModified', 'publisher'],
  BlogPosting: ['image', 'dateModified', 'publisher'],
  Product: ['image', 'offers', 'brand', 'sku'],
  Organization: ['logo', 'contactPoint', 'sameAs'],
};

const PAGE_TYPE_SCHEMAS: Record<string, string[]> = {
  blog: ['Article', 'BlogPosting', 'NewsArticle'],
  product: ['Product'],
  homepage: ['Organization', 'WebSite', 'WebPage'],
  about: ['Organization', 'Person', 'AboutPage'],
  contact: ['LocalBusiness', 'ContactPoint', 'Organization'],
  other: [],
};

function expandGraphItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    const items: unknown[] = [];
    for (const item of parsed) {
      items.push(...expandGraphItems(item));
    }
    return items;
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) {
      const items: unknown[] = [];
      for (const graphItem of obj['@graph']) {
        items.push(...expandGraphItems(graphItem));
      }
      return items;
    }
    return [obj];
  }

  return [];
}

function extractTypes(item: unknown): string[] {
  if (!item || typeof item !== 'object') return [];
  const obj = item as Record<string, unknown>;
  const typeVal = obj['@type'];
  if (typeof typeVal === 'string') return [typeVal];
  if (Array.isArray(typeVal)) return typeVal.filter((t): t is string => typeof t === 'string');
  return [];
}

function extractProperties(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== 'object') return {};
  const obj = item as Record<string, unknown>;
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith('@')) {
      properties[key] = value;
    }
  }
  return properties;
}

function validateProperties(types: string[], properties: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const propKeys = new Set(Object.keys(properties));
  for (const type of types) {
    const required = SCHEMA_REQUIRED_PROPERTIES[type];
    if (required) {
      for (const prop of required) {
        if (!propKeys.has(prop)) {
          issues.push(type + ' is missing required property "' + prop + '"');
        }
      }
    }
    const recommended = SCHEMA_RECOMMENDED_PROPERTIES[type];
    if (recommended) {
      for (const prop of recommended) {
        if (!propKeys.has(prop)) {
          issues.push(type + ' is missing recommended property "' + prop + '"');
        }
      }
    }
  }
  return issues;
}

function extractJsonLd(html: string): SchemaOrgMarkup[] {
  const results: SchemaOrgMarkup[] = [];
  const scriptRegex = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;

    try {
      const parsed = JSON.parse(rawJson);
      const items = expandGraphItems(parsed);

      for (const item of items) {
        const types = extractTypes(item);
        const properties = extractProperties(item);
        const issues = validateProperties(types, properties);

        results.push({
          format: 'json-ld',
          types,
          properties,
          raw: JSON.stringify(item),
          issues,
        });
      }
    } catch {
      results.push({
        format: 'json-ld',
        types: [],
        properties: {},
        raw: rawJson,
        issues: ['Invalid JSON in ld+json script block'],
      });
    }
  }

  return results;
}

function extractMicrodata(html: string): SchemaOrgMarkup[] {
  const results: SchemaOrgMarkup[] = [];
  const itemRegex =
    /<[^>]+\bitemscope\b[^>]+\bitemtype\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)(?=<[^>]+\bitemscope\b[^>]+\bitemtype\b|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(html)) !== null) {
    const itemTypeUrl = match[1];
    const content = match[2] || '';

    const typeMatch = itemTypeUrl.match(/schema\.org\/(\w+)/);
    const type = typeMatch ? typeMatch[1] : itemTypeUrl;

    const properties: Record<string, unknown> = {};
    const propRegex = /<([^>]+\bitemprop\s*=\s*["'][^"']+["'][^>]*)>([^<]*)/gi;
    let propMatch: RegExpExecArray | null;

    while ((propMatch = propRegex.exec(content)) !== null) {
      const tagAttrs = propMatch[1];
      const innerText = propMatch[2]?.trim() || '';

      const nameMatch = tagAttrs.match(/\bitemprop\s*=\s*["']([^"']+)["']/i);
      if (!nameMatch) continue;
      const propName = nameMatch[1];

      const contentMatch = tagAttrs.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
      const propValue = contentMatch ? contentMatch[1] : innerText;

      if (propName && propValue) {
        properties[propName] = propValue;
      }
    }

    const types = [type];
    const issues = validateProperties(types, properties);

    results.push({
      format: 'microdata',
      types,
      properties,
      raw: match[0].slice(0, 500),
      issues,
    });
  }

  return results;
}

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

// --- Tests ---

describe('Schema.org Parser', () => {
  describe('extractJsonLd', () => {
    it('extracts a single JSON-LD block', () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Acme Corp",
            "url": "https://acme.com"
          }
          </script>
        </head>
        </html>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(1);
      expect(results[0].format).toBe('json-ld');
      expect(results[0].types).toEqual(['Organization']);
      expect(results[0].properties.name).toBe('Acme Corp');
      expect(results[0].properties.url).toBe('https://acme.com');
    });

    it('extracts multiple JSON-LD blocks', () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
          {"@type": "Organization", "name": "Acme", "url": "https://acme.com"}
          </script>
          <script type="application/ld+json">
          {"@type": "WebSite", "name": "Acme Site", "url": "https://acme.com"}
          </script>
        </head>
        </html>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(2);
      expect(results[0].types).toEqual(['Organization']);
      expect(results[1].types).toEqual(['WebSite']);
    });

    it('handles @graph arrays', () => {
      const html = `
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {"@type": "Organization", "name": "Acme", "url": "https://acme.com"},
            {"@type": "WebSite", "name": "Acme Site", "url": "https://acme.com"},
            {"@type": "WebPage", "name": "Home"}
          ]
        }
        </script>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(3);
      expect(results[0].types).toEqual(['Organization']);
      expect(results[1].types).toEqual(['WebSite']);
      expect(results[2].types).toEqual(['WebPage']);
    });

    it('handles top-level array of items', () => {
      const html = `
        <script type="application/ld+json">
        [
          {"@type": "Article", "headline": "Test", "author": "Bob", "datePublished": "2024-01-01"},
          {"@type": "BreadcrumbList", "itemListElement": []}
        ]
        </script>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(2);
      expect(results[0].types).toEqual(['Article']);
      expect(results[1].types).toEqual(['BreadcrumbList']);
    });

    it('reports invalid JSON', () => {
      const html = `
        <script type="application/ld+json">
        { invalid json here }
        </script>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(1);
      expect(results[0].types).toEqual([]);
      expect(results[0].issues).toContain('Invalid JSON in ld+json script block');
    });

    it('detects missing required properties', () => {
      const html = `
        <script type="application/ld+json">
        {"@type": "Article", "headline": "Test Post"}
        </script>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(1);
      expect(results[0].issues).toEqual(
        expect.arrayContaining([
          'Article is missing required property "author"',
          'Article is missing required property "datePublished"',
        ]),
      );
    });

    it('detects missing recommended properties', () => {
      const html = `
        <script type="application/ld+json">
        {
          "@type": "Article",
          "headline": "Test",
          "author": "Bob",
          "datePublished": "2024-01-01"
        }
        </script>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(1);
      // Has all required, but missing recommended (image, dateModified, publisher)
      expect(results[0].issues).toEqual(
        expect.arrayContaining([
          'Article is missing recommended property "image"',
          'Article is missing recommended property "publisher"',
        ]),
      );
    });

    it('handles multiple @type values', () => {
      const html = `
        <script type="application/ld+json">
        {"@type": ["Article", "BlogPosting"], "headline": "Test", "author": "Bob", "datePublished": "2024-01-01"}
        </script>
      `;

      const results = extractJsonLd(html);
      expect(results).toHaveLength(1);
      expect(results[0].types).toEqual(['Article', 'BlogPosting']);
    });

    it('returns empty for HTML with no JSON-LD', () => {
      const html = '<html><body><p>Hello</p></body></html>';
      const results = extractJsonLd(html);
      expect(results).toHaveLength(0);
    });

    it('skips empty script blocks', () => {
      const html = '<script type="application/ld+json">   </script>';
      const results = extractJsonLd(html);
      expect(results).toHaveLength(0);
    });
  });

  describe('extractMicrodata', () => {
    it('extracts microdata from itemscope elements', () => {
      const html = `
        <div itemscope itemtype="https://schema.org/Product">
          <span itemprop="name">Widget</span>
          <span itemprop="description">A great widget</span>
        </div>
      `;

      const results = extractMicrodata(html);
      expect(results).toHaveLength(1);
      expect(results[0].format).toBe('microdata');
      expect(results[0].types).toEqual(['Product']);
      expect(results[0].properties.name).toBe('Widget');
      expect(results[0].properties.description).toBe('A great widget');
    });

    it('extracts content attribute values', () => {
      const html = `
        <div itemscope itemtype="https://schema.org/Article">
          <meta itemprop="headline" content="My Article">
          <meta itemprop="datePublished" content="2024-01-15">
        </div>
      `;

      const results = extractMicrodata(html);
      expect(results).toHaveLength(1);
      expect(results[0].properties.headline).toBe('My Article');
      expect(results[0].properties.datePublished).toBe('2024-01-15');
    });

    it('returns empty for HTML with no microdata', () => {
      const html = '<html><body><p>No microdata</p></body></html>';
      const results = extractMicrodata(html);
      expect(results).toHaveLength(0);
    });
  });

  describe('inferPageType', () => {
    it('identifies blog pages from URL path', () => {
      expect(inferPageType('https://example.com/blog/my-post', null)).toBe('blog');
      expect(inferPageType('https://example.com/post/123', null)).toBe('blog');
      expect(inferPageType('https://example.com/articles/test', null)).toBe('blog');
      expect(inferPageType('https://example.com/news/latest', null)).toBe('blog');
    });

    it('identifies product pages from URL path', () => {
      expect(inferPageType('https://example.com/product/widget', null)).toBe('product');
      expect(inferPageType('https://example.com/shop/items', null)).toBe('product');
      expect(inferPageType('https://example.com/store/category', null)).toBe('product');
    });

    it('identifies about pages', () => {
      expect(inferPageType('https://example.com/about', null)).toBe('about');
      expect(inferPageType('https://example.com/about-us', null)).toBe('about');
      expect(inferPageType('https://example.com/about/team', null)).toBe('about');
    });

    it('identifies contact pages', () => {
      expect(inferPageType('https://example.com/contact', null)).toBe('contact');
      expect(inferPageType('https://example.com/contact-us', null)).toBe('contact');
    });

    it('identifies homepage', () => {
      expect(inferPageType('https://example.com/', null)).toBe('homepage');
      expect(inferPageType('https://example.com/home', null)).toBe('homepage');
    });

    it('returns other for unknown pages', () => {
      expect(inferPageType('https://example.com/pricing', null)).toBe('other');
      expect(inferPageType('https://example.com/faq', null)).toBe('other');
    });

    it('uses title as fallback for blog detection', () => {
      expect(inferPageType('https://example.com/thoughts/idea', 'Our Blog — Latest Ideas')).toBe('blog');
    });

    it('uses title for about detection', () => {
      expect(inferPageType('https://example.com/team', 'About Us — Our Team')).toBe('about');
    });

    it('uses title for contact detection', () => {
      expect(inferPageType('https://example.com/get-in-touch', 'Contact Us')).toBe('contact');
    });

    it('handles URLs without protocol', () => {
      // Falls back to using url as path string
      expect(inferPageType('/blog/test', null)).toBe('blog');
      expect(inferPageType('/product/widget', null)).toBe('product');
    });
  });

  describe('validateSchemaForPage', () => {
    it('reports missing schemas for blog pages', () => {
      const issues = validateSchemaForPage([], 'blog');
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('No Schema.org markup found');
      expect(issues[0]).toContain('Article');
    });

    it('accepts blog pages with Article schema', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Article'],
          properties: { headline: 'Test', author: 'Bob', datePublished: '2024-01-01' },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'blog');
      // Should not report missing types (Article is present)
      const typeIssues = issues.filter((i) => i.includes('Missing recommended schema types'));
      expect(typeIssues).toHaveLength(0);
    });

    it('accepts blog pages with BlogPosting schema', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['BlogPosting'],
          properties: { headline: 'Test', author: 'Bob', datePublished: '2024-01-01' },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'blog');
      const typeIssues = issues.filter((i) => i.includes('Missing recommended schema types'));
      expect(typeIssues).toHaveLength(0);
    });

    it('reports missing schemas for product pages', () => {
      const issues = validateSchemaForPage([], 'product');
      expect(issues.some((i) => i.includes('Product'))).toBe(true);
    });

    it('reports missing pricing for product schema', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Product'],
          properties: { name: 'Widget', description: 'A widget' },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'product');
      expect(issues.some((i) => i.includes('pricing'))).toBe(true);
    });

    it('does not report pricing issue when offers present', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Product'],
          properties: {
            name: 'Widget',
            description: 'A widget',
            offers: { price: '9.99', availability: 'InStock' },
          },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'product');
      expect(issues.some((i) => i.includes('pricing'))).toBe(false);
    });

    it('reports missing schemas for homepage', () => {
      const issues = validateSchemaForPage([], 'homepage');
      expect(issues.some((i) => i.includes('Organization') || i.includes('WebSite'))).toBe(true);
    });

    it('accepts homepage with Organization schema', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Organization'],
          properties: { name: 'Acme', url: 'https://acme.com' },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'homepage');
      // Should not flag missing Organization/WebSite
      expect(issues.some((i) => i.includes('Homepage should include'))).toBe(false);
    });

    it('reports missing datePublished for blog Article', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Article'],
          properties: { headline: 'Test', author: 'Bob' },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'blog');
      expect(issues.some((i) => i.includes('datePublished'))).toBe(true);
    });

    it('reports missing author for blog Article', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['Article'],
          properties: { headline: 'Test', datePublished: '2024-01-01' },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'blog');
      expect(issues.some((i) => i.includes('author'))).toBe(true);
    });

    it('returns no issues for "other" page type', () => {
      const issues = validateSchemaForPage([], 'other');
      expect(issues).toHaveLength(0);
    });

    it('reports when schemas exist but wrong type for page', () => {
      const schemas: SchemaOrgMarkup[] = [
        {
          format: 'json-ld',
          types: ['FAQPage'],
          properties: { mainEntity: [] },
          raw: '{}',
          issues: [],
        },
      ];
      const issues = validateSchemaForPage(schemas, 'product');
      expect(issues.some((i) => i.includes('Missing recommended schema types'))).toBe(true);
    });

    it('reports contact page issues', () => {
      const issues = validateSchemaForPage([], 'contact');
      expect(issues.some((i) => i.includes('LocalBusiness') || i.includes('ContactPoint'))).toBe(true);
    });

    it('reports about page issues', () => {
      const issues = validateSchemaForPage([], 'about');
      expect(issues.some((i) => i.includes('Organization') || i.includes('Person'))).toBe(true);
    });
  });

  describe('validateProperties', () => {
    it('reports all missing required properties', () => {
      const issues = validateProperties(['Article'], {});
      expect(issues).toEqual(
        expect.arrayContaining([
          'Article is missing required property "headline"',
          'Article is missing required property "author"',
          'Article is missing required property "datePublished"',
        ]),
      );
    });

    it('reports no issues when all required properties present', () => {
      const issues = validateProperties(['Person'], { name: 'Bob' });
      const requiredIssues = issues.filter((i) => i.includes('required'));
      expect(requiredIssues).toHaveLength(0);
    });

    it('reports missing recommended properties', () => {
      const issues = validateProperties(['Organization'], { name: 'Acme', url: 'https://acme.com' });
      expect(issues).toEqual(
        expect.arrayContaining([
          'Organization is missing recommended property "logo"',
          'Organization is missing recommended property "contactPoint"',
          'Organization is missing recommended property "sameAs"',
        ]),
      );
    });

    it('handles unknown schema types gracefully', () => {
      const issues = validateProperties(['UnknownType'], { foo: 'bar' });
      expect(issues).toHaveLength(0);
    });

    it('validates multiple types', () => {
      const issues = validateProperties(['Article', 'BlogPosting'], {
        headline: 'Test',
        author: 'Bob',
        datePublished: '2024-01-01',
      });
      // Both types check same required props (already satisfied), but both check recommended
      const recommendedIssues = issues.filter((i) => i.includes('recommended'));
      expect(recommendedIssues.length).toBeGreaterThan(0);
    });
  });

  describe('expandGraphItems', () => {
    it('expands @graph arrays into items', () => {
      const input = {
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'Organization' }, { '@type': 'WebSite' }],
      };
      const items = expandGraphItems(input);
      expect(items).toHaveLength(2);
    });

    it('returns single object as array', () => {
      const input = { '@type': 'Article' };
      const items = expandGraphItems(input);
      expect(items).toHaveLength(1);
    });

    it('flattens top-level arrays', () => {
      const input = [{ '@type': 'Article' }, { '@type': 'WebSite' }];
      const items = expandGraphItems(input);
      expect(items).toHaveLength(2);
    });

    it('handles null/undefined', () => {
      expect(expandGraphItems(null)).toHaveLength(0);
      expect(expandGraphItems(undefined)).toHaveLength(0);
    });

    it('handles nested @graph with top-level array', () => {
      const input = [
        {
          '@graph': [{ '@type': 'Organization' }, { '@type': 'WebPage' }],
        },
      ];
      const items = expandGraphItems(input);
      expect(items).toHaveLength(2);
    });
  });
});
