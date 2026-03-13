import { Octokit } from 'octokit';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GitHubCmsConfig = {
  /** GitHub owner (user or org) */
  owner: string;
  /** Repository name */
  repo: string;
  /** Base branch to branch from and merge into (default: "main") */
  base_branch?: string;
  /** Path inside the repo where blog posts live, e.g. "app/blog" */
  content_path: string;
  /** File format to generate */
  content_format: 'page.tsx' | 'mdx' | 'markdown';
  /** Automatically merge the PR after creation */
  auto_merge?: boolean;
};

export type BlogPostContent = {
  /** URL-safe slug, e.g. "best-tortillas-in-texas" */
  slug: string;
  /** Human-readable title */
  title: string;
  /** Meta description for SEO */
  description: string;
  /** Comma-separated keywords */
  keywords: string;
  /** Blog category label, e.g. "Recipes" */
  category: string;
  /** ISO-8601 date string */
  publishDate: string;
  /** Estimated read time, e.g. "5 min read" */
  readTime: string;
  /** Short excerpt shown in the header */
  excerpt: string;
  /** Markdown body content */
  body: string;
  /** Optional hero image path relative to public, e.g. "/images/blog/slug-hero.webp" */
  heroImage?: string;
};

export type CreatePRResult = {
  prUrl: string;
  prNumber: number;
  branch: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a slug like "best-tortillas-in-texas" to a PascalCase component name
 * like "BestTortillasInTexasPage".
 */
export function slugToComponentName(slug: string): string {
  return (
    slug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Page'
  );
}

/**
 * Escape characters that are special in JSX: &, ', ".
 */
function escapeJsx(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
}

/**
 * Convert a subset of Markdown to JSX-compatible React elements.
 *
 * Supported syntax:
 * - Headings: ## and ###
 * - Paragraphs (blank-line delimited)
 * - Unordered lists (lines starting with "- ")
 * - Bold: **text**
 * - Italic: *text*
 * - Links: [text](url) → <Link href="url">text</Link>
 */
export function markdownToJsx(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let inList = false;
  let paragraphBuffer: string[] = [];

  function flushParagraph(): void {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(' ');
    output.push(`          <p>${convertInline(text)}</p>`);
    paragraphBuffer = [];
  }

  function closeList(): void {
    if (inList) {
      output.push('          </ul>');
      inList = false;
    }
  }

  function convertInline(text: string): string {
    let result = escapeJsx(text);
    // Bold: **text**
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text* (must not match bold)
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Links: [text](url)
    result = result.replace(/\[(.+?)\]\((.+?)\)/g, '<Link href="$2">$1</Link>');
    return result;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Blank line
    if (trimmed === '') {
      flushParagraph();
      closeList();
      continue;
    }

    // H2
    if (trimmed.startsWith('## ')) {
      flushParagraph();
      closeList();
      const heading = trimmed.slice(3);
      output.push(`          <h2 className="text-2xl font-bold mt-8 mb-4">${convertInline(heading)}</h2>`);
      continue;
    }

    // H3
    if (trimmed.startsWith('### ')) {
      flushParagraph();
      closeList();
      const heading = trimmed.slice(4);
      output.push(`          <h3 className="text-xl font-semibold mt-6 mb-3">${convertInline(heading)}</h3>`);
      continue;
    }

    // List item
    if (trimmed.startsWith('- ')) {
      flushParagraph();
      if (!inList) {
        output.push('          <ul className="list-disc pl-6 space-y-2">');
        inList = true;
      }
      const itemText = trimmed.slice(2);
      output.push(`            <li>${convertInline(itemText)}</li>`);
      continue;
    }

    // Regular text — accumulate into a paragraph
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  closeList();

  return output.join('\n');
}

/**
 * Generate MDX content for a blog post.
 */
export function generateMdxContent(post: BlogPostContent, siteUrl: string, brandName: string): string {
  return `---
title: "${post.title}"
description: "${post.description}"
keywords: "${post.keywords}"
date: "${post.publishDate}"
category: "${post.category}"
readTime: "${post.readTime}"
canonical: "${siteUrl}/blog/${post.slug}"
openGraph:
  title: "${post.title} | ${brandName}"
  description: "${post.description}"
  type: article
  images:
    - "${post.heroImage ?? `/images/blog/${post.slug}-hero.webp`}"
---

${post.body}
`;
}

/**
 * Generate plain Markdown content for a blog post.
 */
export function generateMarkdownContent(post: BlogPostContent, siteUrl: string, brandName: string): string {
  return `---
title: "${post.title}"
description: "${post.description}"
keywords: "${post.keywords}"
date: "${post.publishDate}"
category: "${post.category}"
readTime: "${post.readTime}"
canonical: "${siteUrl}/blog/${post.slug}"
brand: "${brandName}"
image: "${post.heroImage ?? `/images/blog/${post.slug}-hero.webp`}"
---

# ${post.title}

${post.body}
`;
}

// ---------------------------------------------------------------------------
// Main generators
// ---------------------------------------------------------------------------

/**
 * Generate a complete Next.js `page.tsx` file matching the Lone Star blog
 * layout conventions.
 */
export function generateNextJsPage(post: BlogPostContent, siteUrl: string, brandName: string): string {
  const componentName = slugToComponentName(post.slug);
  const heroImage = post.heroImage ?? `/images/blog/${post.slug}-hero.webp`;
  const canonical = `${siteUrl}/blog/${post.slug}`;
  const jsxBody = markdownToJsx(post.body);

  return `import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LastUpdated } from '@/components/seo/LastUpdated';

export const metadata: Metadata = {
  title: '${escapeForTemplate(post.title)} | ${escapeForTemplate(brandName)}',
  description: '${escapeForTemplate(post.description)}',
  keywords: '${escapeForTemplate(post.keywords)}',
  alternates: {
    canonical: '${canonical}',
  },
  openGraph: {
    title: '${escapeForTemplate(post.title)} | ${escapeForTemplate(brandName)}',
    description: '${escapeForTemplate(post.description)}',
    type: 'article',
    images: ['${heroImage}'],
  },
};

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: '${escapeForTemplate(post.title)}',
  description: '${escapeForTemplate(post.description)}',
  image: '${heroImage}',
  datePublished: '${post.publishDate}',
  dateModified: '${post.publishDate}',
  author: {
    '@type': 'Organization',
    name: '${escapeForTemplate(brandName)}',
  },
  publisher: {
    '@type': 'Organization',
    name: '${escapeForTemplate(brandName)}',
    logo: {
      '@type': 'ImageObject',
      url: '${siteUrl}/logo.png',
    },
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': '${canonical}',
  },
};

export default function ${componentName}() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <div className="min-h-screen bg-gradient-to-b from-cream-50 to-masa-50">
        <header className="bg-charcoal-950 text-cream-50 py-12">
          <div className="container mx-auto px-6 max-w-4xl">
            <Breadcrumbs
              items={[
                { label: 'Home', href: '/' },
                { label: 'Blog', href: '/blog' },
                { label: '${escapeForTemplate(post.title)}' },
              ]}
            />
            <div className="mt-6">
              <span className="inline-block bg-salsa-600 text-cream-50 text-sm font-medium px-3 py-1 rounded-full mb-4">
                ${escapeForTemplate(post.category)}
              </span>
              <div className="flex items-center gap-4 text-cream-200 text-sm mb-4">
                <time dateTime="${post.publishDate}">
                  {new Date('${post.publishDate}').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <span>·</span>
                <span>${escapeForTemplate(post.readTime)}</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                ${escapeForTemplate(post.title)}
              </h1>
              <p className="text-lg text-cream-200 max-w-2xl">
                ${escapeForTemplate(post.excerpt)}
              </p>
            </div>
          </div>
        </header>
        <article className="container mx-auto px-6 py-12 max-w-3xl">
          <LastUpdated date="${post.publishDate}" />
          <div className="prose prose-lg max-w-none">
${jsxBody}
          </div>
        </article>
      </div>
    </>
  );
}
`;
}

/**
 * Escape single quotes for use inside JS template literal single-quoted strings.
 */
function escapeForTemplate(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ---------------------------------------------------------------------------
// GitHub PR creation
// ---------------------------------------------------------------------------

/**
 * Create a blog post file on GitHub and open a Pull Request.
 */
export async function createBlogPostPR(
  token: string,
  config: GitHubCmsConfig,
  post: BlogPostContent,
  brandName: string,
  siteUrl: string,
): Promise<CreatePRResult> {
  const octokit = new Octokit({ auth: token });
  const { owner, repo } = config;
  const baseBranch = config.base_branch ?? 'main';
  const branchName = `quadbot/blog/${post.slug}`;

  logger.info({ owner, repo, slug: post.slug }, 'Creating blog post PR');

  // 1. Resolve file content and path based on content_format
  let fileContent: string;
  let filePath: string;

  switch (config.content_format) {
    case 'mdx':
      fileContent = generateMdxContent(post, siteUrl, brandName);
      filePath = `${config.content_path}/${post.slug}.mdx`;
      break;
    case 'markdown':
      fileContent = generateMarkdownContent(post, siteUrl, brandName);
      filePath = `${config.content_path}/${post.slug}.md`;
      break;
    case 'page.tsx':
    default:
      fileContent = generateNextJsPage(post, siteUrl, brandName);
      filePath = `${config.content_path}/${post.slug}/page.tsx`;
      break;
  }

  // 2. Get the SHA of the base branch
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = refData.object.sha;

  logger.debug({ baseBranch, baseSha }, 'Resolved base branch SHA');

  // 3. Create the feature branch
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  logger.info({ branch: branchName }, 'Created feature branch');

  // 4. Create the file on the new branch
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `feat(blog): add "${post.title}"`,
    content: Buffer.from(fileContent).toString('base64'),
    branch: branchName,
  });

  logger.info({ filePath }, 'Created blog post file');

  // 5. Create the Pull Request
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `[Blog] ${post.title}`,
    head: branchName,
    base: baseBranch,
    body: [
      `## New Blog Post: ${post.title}`,
      '',
      `**Category:** ${post.category}`,
      `**Slug:** \`${post.slug}\``,
      `**Read time:** ${post.readTime}`,
      '',
      `> ${post.excerpt}`,
      '',
      '---',
      '',
      '_This PR was automatically generated by QuadBot._',
    ].join('\n'),
  });

  logger.info({ prNumber: pr.number, prUrl: pr.html_url }, 'Pull request created');

  // 6. Optionally enable auto-merge
  if (config.auto_merge) {
    try {
      await octokit.graphql(
        `mutation ($pullRequestId: ID!) {
          enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: SQUASH }) {
            pullRequest { number }
          }
        }`,
        { pullRequestId: pr.node_id },
      );
      logger.info({ prNumber: pr.number }, 'Auto-merge enabled');
    } catch (err) {
      // Auto-merge may not be available on all repos — log and continue
      logger.warn({ prNumber: pr.number, err }, 'Failed to enable auto-merge (may not be available on this repo)');
    }
  }

  return {
    prUrl: pr.html_url,
    prNumber: pr.number,
    branch: branchName,
  };
}
