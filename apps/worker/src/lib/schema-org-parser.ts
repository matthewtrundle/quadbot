/**
 * Schema.org structured data parser.
 * Extracts and validates JSON-LD, Microdata, and RDFa markup from HTML.
 * Uses regex-based parsing — no external HTML parser dependencies.
 */

export type SchemaOrgMarkup = {
  format: 'json-ld' | 'microdata' | 'rdfa';
  types: string[];
  properties: Record<string, unknown>;
  raw: string;
  issues: string[];
};

export type PageSchemaAnalysis = {
  url: string;
  schemas: SchemaOrgMarkup[];
  missing_recommended: string[];
  issues: string[];
};

/**
 * Required and recommended properties for common Schema.org types.
 */
const SCHEMA_REQUIRED_PROPERTIES: Record<string, string[]> = {
  Article: ['headline', 'author', 'datePublished'],
  BlogPosting: ['headline', 'author', 'datePublished'],
  NewsArticle: ['headline', 'author', 'datePublished'],
  Product: ['name', 'description'],
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  Person: ['name'],
  LocalBusiness: ['name', 'address'],
  ContactPoint: ['contactType'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  HowTo: ['name', 'step'],
  Review: ['itemReviewed', 'reviewRating'],
  Event: ['name', 'startDate', 'location'],
};

/**
 * Recommended properties (not required but strongly suggested).
 */
const SCHEMA_RECOMMENDED_PROPERTIES: Record<string, string[]> = {
  Article: ['image', 'dateModified', 'publisher'],
  BlogPosting: ['image', 'dateModified', 'publisher'],
  Product: ['image', 'offers', 'brand', 'sku'],
  Organization: ['logo', 'contactPoint', 'sameAs'],
  WebSite: ['potentialAction'],
  LocalBusiness: ['telephone', 'openingHours', 'geo'],
};

/**
 * Page type → recommended Schema.org types mapping.
 */
const PAGE_TYPE_SCHEMAS: Record<string, string[]> = {
  blog: ['Article', 'BlogPosting', 'NewsArticle'],
  product: ['Product'],
  homepage: ['Organization', 'WebSite', 'WebPage'],
  about: ['Organization', 'Person', 'AboutPage'],
  contact: ['LocalBusiness', 'ContactPoint', 'Organization'],
  other: [],
};

/**
 * Extract all JSON-LD structured data from HTML.
 */
export function extractJsonLd(html: string): SchemaOrgMarkup[] {
  const results: SchemaOrgMarkup[] = [];
  // Match <script type="application/ld+json"> blocks
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

/**
 * Expand @graph arrays into individual items.
 */
function expandGraphItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    // Top-level array of items
    const items: unknown[] = [];
    for (const item of parsed) {
      items.push(...expandGraphItems(item));
    }
    return items;
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;

    // Handle @graph arrays
    if (Array.isArray(obj['@graph'])) {
      const items: unknown[] = [];
      for (const graphItem of obj['@graph']) {
        items.push(...expandGraphItems(graphItem));
      }
      return items;
    }

    // Single item
    return [obj];
  }

  return [];
}

/**
 * Extract @type from a JSON-LD object.
 */
function extractTypes(item: unknown): string[] {
  if (!item || typeof item !== 'object') return [];
  const obj = item as Record<string, unknown>;
  const typeVal = obj['@type'];

  if (typeof typeVal === 'string') return [typeVal];
  if (Array.isArray(typeVal)) return typeVal.filter((t): t is string => typeof t === 'string');
  return [];
}

/**
 * Extract non-@ properties from a JSON-LD object.
 */
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

/**
 * Validate that required properties exist for the given types.
 */
function validateProperties(types: string[], properties: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const propKeys = new Set(Object.keys(properties));

  for (const type of types) {
    const required = SCHEMA_REQUIRED_PROPERTIES[type];
    if (required) {
      for (const prop of required) {
        if (!propKeys.has(prop)) {
          issues.push(`${type} is missing required property "${prop}"`);
        }
      }
    }

    const recommended = SCHEMA_RECOMMENDED_PROPERTIES[type];
    if (recommended) {
      for (const prop of recommended) {
        if (!propKeys.has(prop)) {
          issues.push(`${type} is missing recommended property "${prop}"`);
        }
      }
    }
  }

  return issues;
}

/**
 * Extract Microdata (itemscope/itemtype/itemprop) from HTML.
 */
export function extractMicrodata(html: string): SchemaOrgMarkup[] {
  const results: SchemaOrgMarkup[] = [];

  // Match elements with itemscope and itemtype (top-level items)
  const itemRegex =
    /<[^>]+\bitemscope\b[^>]+\bitemtype\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)(?=<[^>]+\bitemscope\b[^>]+\bitemtype\b|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(html)) !== null) {
    const itemTypeUrl = match[1];
    const content = match[2] || '';

    // Extract the schema type from the URL (e.g., "https://schema.org/Product" → "Product")
    const typeMatch = itemTypeUrl.match(/schema\.org\/(\w+)/);
    const type = typeMatch ? typeMatch[1] : itemTypeUrl;

    // Extract itemprop values from child elements
    const properties: Record<string, unknown> = {};
    // Match any tag that has itemprop attribute, capturing the full tag and inner text
    const propRegex = /<([^>]+\bitemprop\s*=\s*["'][^"']+["'][^>]*)>([^<]*)/gi;
    let propMatch: RegExpExecArray | null;

    while ((propMatch = propRegex.exec(content)) !== null) {
      const tagAttrs = propMatch[1];
      const innerText = propMatch[2]?.trim() || '';

      // Extract itemprop name
      const nameMatch = tagAttrs.match(/\bitemprop\s*=\s*["']([^"']+)["']/i);
      if (!nameMatch) continue;
      const propName = nameMatch[1];

      // Extract content attribute if present
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
      raw: match[0].slice(0, 500), // Truncate raw for microdata
      issues,
    });
  }

  return results;
}

/**
 * Infer page type from URL path and optional title.
 */
export function inferPageType(url: string, title: string | null): string {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }

  const titleLower = (title || '').toLowerCase();

  // Blog/article patterns
  if (/^\/(blog|post|posts|article|articles|news)(\/|$)/.test(path)) return 'blog';
  if (titleLower.includes('blog') && path !== '/') return 'blog';

  // Product/shop patterns
  if (/^\/(product|products|shop|store|item)(\/|$)/.test(path)) return 'product';

  // About page
  if (/^\/about/.test(path)) return 'about';
  if (titleLower.includes('about us')) return 'about';

  // Contact page
  if (/^\/contact/.test(path)) return 'contact';
  if (titleLower.includes('contact us')) return 'contact';

  // Homepage
  if (path === '/' || path === '/home' || path === '/home/' || path === '') return 'homepage';

  return 'other';
}

/**
 * Validate schema completeness for a given page type.
 * Returns an array of issues and suggestions.
 */
export function validateSchemaForPage(schemas: SchemaOrgMarkup[], pageType: string): string[] {
  const issues: string[] = [];
  const recommendedTypes = PAGE_TYPE_SCHEMAS[pageType] || [];

  if (recommendedTypes.length === 0) return issues;

  // Collect all types found across schemas
  const foundTypes = new Set<string>();
  for (const schema of schemas) {
    for (const type of schema.types) {
      foundTypes.add(type);
    }
  }

  // Check if at least one recommended type is present
  const hasRecommended = recommendedTypes.some((t) => foundTypes.has(t));

  if (!hasRecommended && schemas.length === 0) {
    issues.push(`No Schema.org markup found. For a ${pageType} page, consider adding: ${recommendedTypes.join(', ')}`);
  } else if (!hasRecommended) {
    issues.push(
      `Missing recommended schema types for ${pageType} page. Consider adding: ${recommendedTypes.join(', ')}`,
    );
  }

  // Page-type-specific checks
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
 * Analyze a single page's Schema.org markup.
 */
export function analyzePageSchema(url: string, html: string, title: string | null): PageSchemaAnalysis {
  const jsonLdSchemas = extractJsonLd(html);
  const microdataSchemas = extractMicrodata(html);
  const allSchemas = [...jsonLdSchemas, ...microdataSchemas];

  const pageType = inferPageType(url, title);
  const pageIssues = validateSchemaForPage(allSchemas, pageType);

  // Collect all per-schema issues
  const allIssues: string[] = [];
  for (const schema of allSchemas) {
    allIssues.push(...schema.issues);
  }
  allIssues.push(...pageIssues);

  return {
    url,
    schemas: allSchemas,
    missing_recommended: pageIssues,
    issues: allIssues,
  };
}
