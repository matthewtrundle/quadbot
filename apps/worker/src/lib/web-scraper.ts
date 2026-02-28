import { createHash } from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ScrapedPage = {
  url: string;
  title: string | null;
  meta_description: string | null;
  content_hash: string;
  word_count: number;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  schema_types: string[];
};

// ─── Constants ──────────────────────────────────────────────────────────────

const USER_AGENT = 'QuadBot/1.0';
const FETCH_TIMEOUT_MS = 10_000;

// ─── HTML Extraction Helpers ────────────────────────────────────────────────

/**
 * Extract <title> content from HTML.
 */
export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

/**
 * Extract meta description from HTML.
 */
export function extractMetaDescription(html: string): string | null {
  const match = html.match(
    /<meta\s+[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*\/?>/i,
  );
  if (match) return decodeHtmlEntities(match[1].trim());

  // Also try content before name (order can vary)
  const match2 = html.match(
    /<meta\s+[^>]*content\s*=\s*["']([\s\S]*?)["'][^>]*name\s*=\s*["']description["'][^>]*\/?>/i,
  );
  return match2 ? decodeHtmlEntities(match2[1].trim()) : null;
}

/**
 * Extract h1, h2, h3 headings from HTML.
 */
export function extractHeadings(html: string): { h1: string[]; h2: string[]; h3: string[] } {
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

/**
 * Extract Schema.org @type values from JSON-LD script blocks.
 */
export function extractSchemaTypes(html: string): string[] {
  const types: string[] = [];
  const regex = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    try {
      const json = JSON.parse(match[1]);
      collectTypes(json, types);
    } catch {
      // Malformed JSON-LD — skip
    }
  }

  return [...new Set(types)];
}

/**
 * Recursively collect @type values from a parsed JSON-LD object.
 */
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
    // Recurse into nested objects (e.g., @graph)
    for (const value of Object.values(record)) {
      if (typeof value === 'object' && value !== null) {
        collectTypes(value, types);
      }
    }
  }
}

/**
 * Strip all HTML tags from text.
 */
export function stripHtmlTags(html: string): string {
  // Remove script and style blocks first
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Remove all tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode entities
  text = decodeHtmlEntities(text);
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Decode common HTML entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Compute SHA256 hash of text.
 */
export function computeContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Count words in plain text.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Scrape a single page and return structured data.
 */
export async function scrapePage(url: string): Promise<ScrapedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const html = await response.text();
    const bodyText = stripHtmlTags(html);

    return {
      url,
      title: extractTitle(html),
      meta_description: extractMetaDescription(html),
      content_hash: computeContentHash(bodyText),
      word_count: countWords(bodyText),
      headings: extractHeadings(html),
      schema_types: extractSchemaTypes(html),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch sitemap.xml from a domain and extract page URLs.
 * Returns up to 100 URLs. Returns empty array if sitemap not found.
 */
export async function fetchSitemap(domain: string): Promise<string[]> {
  const sitemapUrl = `https://${domain}/sitemap.xml`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) return [];

    const xml = await response.text();
    return extractSitemapUrls(xml);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract <loc> URLs from sitemap XML content.
 * Returns up to 100 URLs.
 */
export function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null && urls.length < 100) {
    const url = match[1].trim();
    if (url) urls.push(url);
  }

  return urls;
}

/**
 * Check robots.txt to see if a path is allowed for QuadBot user agent.
 * Returns true if allowed (or if robots.txt is not found / unparseable).
 */
export async function checkRobotsTxt(domain: string, path: string): Promise<boolean> {
  const robotsUrl = `https://${domain}/robots.txt`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) return true;

    const text = await response.text();
    return isPathAllowed(text, path);
  } catch {
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse robots.txt content and check if a path is allowed for QuadBot.
 * Checks QuadBot-specific rules first, then falls back to wildcard (*) rules.
 */
export function isPathAllowed(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split('\n').map((l) => l.trim());

  // Collect rules for QuadBot and wildcard user agents
  const quadbotRules: Array<{ type: 'allow' | 'disallow'; path: string }> = [];
  const wildcardRules: Array<{ type: 'allow' | 'disallow'; path: string }> = [];

  let currentAgent: 'quadbot' | 'wildcard' | 'other' | null = null;

  for (const line of lines) {
    // Skip comments and empty lines
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

  // Use QuadBot-specific rules if any exist, otherwise wildcard
  const applicableRules = quadbotRules.length > 0 ? quadbotRules : wildcardRules;

  if (applicableRules.length === 0) return true;

  // Find the most specific matching rule (longest path prefix)
  let bestMatch: { type: 'allow' | 'disallow'; path: string } | null = null;
  let bestLength = -1;

  for (const rule of applicableRules) {
    if (rule.path === '' && rule.type === 'disallow') {
      // Empty disallow means allow all — skip as a match
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
