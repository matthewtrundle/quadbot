# Utility Features — Phase B Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real utility to QuadBot — connect existing systems together, add new data sources, and make the AI engine capable of _doing things_ (publishing blog posts, tracking keywords, monitoring page speed) instead of just suggesting things.

**Architecture:** Seven feature workstreams. The GitHub CMS connector is the centerpiece — it transforms QuadBot's content pipeline from "generates markdown to a local folder" into "creates PRs on your real website repo." Content refresh automation wires the existing decay detector to the content writer. PageSpeed uses Google's free API. Benchmarks surface existing job data. Content calendar is a UI over existing scheduled data. The features build on the existing executor/event/artifact architecture with minimal new infrastructure.

**Tech Stack:** Octokit (GitHub API), Google PageSpeed Insights API (free), Next.js 15, Drizzle ORM, Recharts, existing event-driven job system

---

## Task 1: GitHub CMS Connector — Integration Type & Schema

**Files:**

- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0021_github_cms.sql` (auto-generated)

**Step 1: Add GITHUB_CMS integration type**

In `packages/shared/src/constants.ts`, add to the `IntegrationType` object after LINKEDIN:

```typescript
  // CMS Connectors
  GITHUB_CMS: 'github_cms',
```

**Step 2: Add content_publish_configs table to schema**

In `packages/db/src/schema.ts`, append after `competitorSnapshots`:

```typescript
// === CMS / Publishing Configuration ===

export const contentPublishConfigs = pgTable(
  'content_publish_configs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brand_id: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(), // 'github'
    name: varchar('name', { length: 255 }).notNull(), // e.g. "Lone Star Blog"
    config: jsonb('config')
      .$type<{
        owner: string; // GitHub org/user
        repo: string; // repo name
        branch: string; // target branch (default: 'main')
        blog_directory: string; // e.g. 'app/blog'
        content_format: 'nextjs_page' | 'mdx' | 'markdown';
        site_url: string; // e.g. 'https://lonestartortillas.com'
        auto_merge: boolean; // merge PR automatically or wait for approval
        template_path?: string; // path to a template file in the repo
      }>()
      .notNull(),
    github_token_encrypted: text('github_token_encrypted'), // encrypted PAT or GitHub App token
    is_active: boolean('is_active').default(true).notNull(),
    last_published_at: timestamp('last_published_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_content_publish_configs_brand').on(table.brand_id)],
);
```

**Step 3: Generate and run migration**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm drizzle-kit generate && pnpm turbo db:migrate`

**Step 4: Commit**

```bash
git add packages/shared/src/constants.ts packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add github_cms integration type and content_publish_configs table"
```

---

## Task 2: GitHub CMS Connector — GitHub Client Library

**Files:**

- Create: `apps/worker/src/lib/github-cms.ts`
- Modify: `apps/worker/package.json` (add octokit)

**Step 1: Install Octokit**

Run: `cd /Users/matthewrundle/Documents/quadbot/apps/worker && pnpm add octokit`

**Step 2: Create GitHub CMS client**

Create `apps/worker/src/lib/github-cms.ts`:

```typescript
import { Octokit } from 'octokit';
import { logger } from '../logger.js';

export type GitHubCmsConfig = {
  owner: string;
  repo: string;
  branch: string;
  blog_directory: string;
  content_format: 'nextjs_page' | 'mdx' | 'markdown';
  site_url: string;
  auto_merge: boolean;
  template_path?: string;
};

export type BlogPostContent = {
  slug: string;
  title: string;
  meta_description: string;
  content_markdown: string;
  excerpt: string;
  tags: string[];
  category: string;
  read_time_minutes: number;
  seo_keywords: string[];
};

/**
 * Generate a Next.js page.tsx file for a blog post.
 * Matches the Lone Star Tortillas blog format:
 * - Metadata export with SEO fields
 * - JSON-LD Article schema
 * - Breadcrumb navigation
 * - Styled header with category/date/read-time
 * - Prose content body
 */
export function generateNextJsPage(post: BlogPostContent, siteUrl: string, brandName: string): string {
  const dateStr = new Date().toISOString().split('T')[0];
  const canonicalUrl = `${siteUrl}/blog/${post.slug}`;

  // Escape backticks and special chars for template literal safety
  const escapeForJsx = (s: string) => s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const escapeForJs = (s: string) => s.replace(/'/g, "\\'").replace(/"/g, '\\"');

  // Convert markdown content to JSX-safe HTML-like content
  // Simple conversion: headers, paragraphs, lists, bold, italic, links
  const contentJsx = markdownToJsx(post.content_markdown);

  return `import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LastUpdated } from '@/components/seo/LastUpdated';

export const metadata: Metadata = {
  title: '${escapeForJs(post.title)} | ${brandName}',
  description: '${escapeForJs(post.meta_description)}',
  keywords: '${post.seo_keywords.join(', ')}',
  alternates: {
    canonical: '${canonicalUrl}',
  },
  openGraph: {
    title: '${escapeForJs(post.title)}',
    description: '${escapeForJs(post.meta_description)}',
    type: 'article',
    images: ['/images/blog/${post.slug}-hero.webp'],
  },
};

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: '${escapeForJs(post.title)}',
  description: '${escapeForJs(post.meta_description)}',
  author: {
    '@type': 'Organization',
    name: '${brandName}',
  },
  publisher: {
    '@type': 'Organization',
    name: '${brandName}',
    logo: {
      '@type': 'ImageObject',
      url: '${siteUrl}/logo.png',
    },
  },
  datePublished: '${dateStr}',
  dateModified: '${dateStr}',
  articleSection: '${post.category}',
  mainEntityOfPage: '${canonicalUrl}',
};

export default function ${slugToComponentName(post.slug)}Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <div className="min-h-screen bg-gradient-to-b from-cream-50 to-masa-50">
        <header className="bg-charcoal-950 text-cream-50 py-12">
          <div className="container mx-auto px-6">
            <Breadcrumbs
              items={[
                { label: 'Home', href: '/' },
                { label: 'Blog', href: '/blog' },
                { label: '${escapeForJsx(post.title)}' },
              ]}
            />
            <div className="flex items-center gap-2 text-sunset-400 text-sm mb-3 mt-4">
              <span className="px-3 py-1 bg-sunset-900/20 rounded-full">${post.category}</span>
              <span>&bull;</span>
              <span>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span>&bull;</span>
              <span>${post.read_time_minutes} min read</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mt-2">${escapeForJsx(post.title)}</h1>
            <p className="text-cream-300 mt-4 text-lg">${escapeForJsx(post.excerpt)}</p>
          </div>
        </header>

        <article className="container mx-auto px-6 py-12 max-w-3xl">
          <LastUpdated date="${dateStr}" />

          <div className="prose prose-lg max-w-none">
${contentJsx}
          </div>
        </article>
      </div>
    </>
  );
}
`;
}

/**
 * Convert a slug like "texas-breakfast-taco-guide" to "TexasBreakfastTacoGuide"
 */
function slugToComponentName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Convert markdown to JSX content.
 * Handles: headers, paragraphs, bold, italic, links, lists.
 */
function markdownToJsx(markdown: string): string {
  const lines = markdown.split('\n');
  const jsxLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        jsxLines.push('            </ul>');
        inList = false;
      }
      continue;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      jsxLines.push(`            <h3>${escapeJsx(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      jsxLines.push(`            <h2>${escapeJsx(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      jsxLines.push(`            <h2>${escapeJsx(trimmed.slice(2))}</h2>`);
    }
    // Lists
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        jsxLines.push('            <ul>');
        inList = true;
      }
      jsxLines.push(`              <li>${inlineMarkdown(trimmed.slice(2))}</li>`);
    }
    // Paragraphs
    else {
      jsxLines.push(`            <p>${inlineMarkdown(trimmed)}</p>`);
    }
  }

  if (inList) {
    jsxLines.push('            </ul>');
  }

  return jsxLines.join('\n');
}

/** Convert inline markdown (bold, italic, links) to JSX */
function inlineMarkdown(text: string): string {
  return escapeJsx(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<Link href="$2">$1</Link>');
}

function escapeJsx(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
}

/**
 * Create a pull request on GitHub with the blog post content.
 */
export async function createBlogPostPR(
  token: string,
  config: GitHubCmsConfig,
  post: BlogPostContent,
  brandName: string,
): Promise<{ prUrl: string; prNumber: number; branch: string }> {
  const octokit = new Octokit({ auth: token });
  const { owner, repo, branch: baseBranch, blog_directory, content_format, site_url } = config;

  // Generate branch name
  const prBranch = `quadbot/blog/${post.slug}`;
  const dateStr = new Date().toISOString().split('T')[0];

  // Get the base branch SHA
  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseRef.object.sha;

  // Create branch
  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${prBranch}`,
      sha: baseSha,
    });
  } catch (err: unknown) {
    // Branch may already exist — update it
    if ((err as { status?: number }).status === 422) {
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${prBranch}`,
        sha: baseSha,
        force: true,
      });
    } else {
      throw err;
    }
  }

  // Generate file content based on format
  let filePath: string;
  let fileContent: string;

  switch (content_format) {
    case 'nextjs_page':
      filePath = `${blog_directory}/${post.slug}/page.tsx`;
      fileContent = generateNextJsPage(post, site_url, brandName);
      break;
    case 'mdx':
      filePath = `${blog_directory}/${post.slug}.mdx`;
      fileContent = generateMdxContent(post, dateStr);
      break;
    case 'markdown':
    default:
      filePath = `${blog_directory}/${dateStr}-${post.slug}.md`;
      fileContent = generateMarkdownContent(post, dateStr);
      break;
  }

  // Create or update file
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: `feat(blog): add "${post.title}"

Generated by QuadBot content automation.
Slug: ${post.slug}
Category: ${post.category}
Keywords: ${post.seo_keywords.slice(0, 5).join(', ')}`,
    content: Buffer.from(fileContent).toString('base64'),
    branch: prBranch,
  });

  // Create PR
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `[QuadBot] New blog post: ${post.title}`,
    head: prBranch,
    base: baseBranch,
    body: `## New Blog Post

**Title:** ${post.title}
**Slug:** \`/blog/${post.slug}\`
**Category:** ${post.category}
**Read Time:** ${post.read_time_minutes} min
**SEO Keywords:** ${post.seo_keywords.join(', ')}

### Excerpt
> ${post.excerpt}

---

*This PR was automatically created by [QuadBot](https://quadbot.ai) content automation.*
*Review the content, then merge to publish.*`,
  });

  logger.info(
    {
      prUrl: pr.html_url,
      prNumber: pr.number,
      filePath,
      slug: post.slug,
    },
    'GitHub PR created for blog post',
  );

  // Auto-merge if configured
  if (config.auto_merge) {
    try {
      await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: pr.number,
        merge_method: 'squash',
      });
      logger.info({ prNumber: pr.number }, 'PR auto-merged');
    } catch (err) {
      logger.warn({ prNumber: pr.number, err }, 'Auto-merge failed (may require review)');
    }
  }

  return {
    prUrl: pr.html_url,
    prNumber: pr.number,
    branch: prBranch,
  };
}

function generateMdxContent(post: BlogPostContent, dateStr: string): string {
  return `---
title: "${post.title}"
date: "${dateStr}"
description: "${post.meta_description}"
excerpt: "${post.excerpt}"
tags: [${post.tags.map((t) => `"${t}"`).join(', ')}]
category: "${post.category}"
readTime: ${post.read_time_minutes}
keywords: [${post.seo_keywords.map((k) => `"${k}"`).join(', ')}]
generated: true
---

${post.content_markdown}
`;
}

function generateMarkdownContent(post: BlogPostContent, dateStr: string): string {
  return `---
title: "${post.title}"
date: "${dateStr}"
description: "${post.meta_description}"
excerpt: "${post.excerpt}"
tags: [${post.tags.map((t) => `"${t}"`).join(', ')}]
slug: "${post.slug}"
generated: true
---

${post.content_markdown}
`;
}
```

**Step 3: Commit**

```bash
git add apps/worker/src/lib/github-cms.ts apps/worker/package.json pnpm-lock.yaml
git commit -m "feat: add GitHub CMS client — generates Next.js pages and creates PRs"
```

---

## Task 3: GitHub CMS Connector — Executor

**Files:**

- Create: `apps/worker/src/executors/github-publish.ts`
- Modify: `apps/worker/src/executors/index.ts` (register executor)

**Step 1: Create github-publish executor**

Create `apps/worker/src/executors/github-publish.ts`:

```typescript
import { artifacts, contentPublishConfigs } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { logger } from '../logger.js';
import { createBlogPostPR, type BlogPostContent } from '../lib/github-cms.js';
import { decrypt } from '@quadbot/db/encryption';

export interface GitHubPublishPayload {
  artifact_id: string;
  publish_config_id?: string; // optional, uses first active config if omitted
}

export const githubPublishExecutor: Executor = {
  type: 'github-publish',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, payload } = context;
    const { artifact_id, publish_config_id } = payload as unknown as GitHubPublishPayload;

    if (!artifact_id) {
      return { success: false, error: 'Missing required field: artifact_id' };
    }

    // Load artifact
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, artifact_id)).limit(1);

    if (!artifact || artifact.type !== 'generated_content') {
      return { success: false, error: `Artifact ${artifact_id} not found or wrong type` };
    }

    // Load publish config
    const configQuery = publish_config_id
      ? and(eq(contentPublishConfigs.id, publish_config_id), eq(contentPublishConfigs.brand_id, brandId))
      : and(
          eq(contentPublishConfigs.brand_id, brandId),
          eq(contentPublishConfigs.type, 'github'),
          eq(contentPublishConfigs.is_active, true),
        );

    const [publishConfig] = await db.select().from(contentPublishConfigs).where(configQuery).limit(1);

    if (!publishConfig) {
      return {
        success: false,
        error: 'No GitHub publish configuration found for this brand. Set one up in brand settings.',
      };
    }

    const config = publishConfig.config as {
      owner: string;
      repo: string;
      branch: string;
      blog_directory: string;
      content_format: 'nextjs_page' | 'mdx' | 'markdown';
      site_url: string;
      auto_merge: boolean;
    };

    // Decrypt GitHub token
    const token = publishConfig.github_token_encrypted
      ? decrypt(publishConfig.github_token_encrypted)
      : process.env.GITHUB_CMS_TOKEN;

    if (!token) {
      return { success: false, error: 'No GitHub token configured' };
    }

    // Extract post content from artifact
    const content = artifact.content as Record<string, unknown>;
    const post: BlogPostContent = {
      slug: (content.slug as string) || '',
      title: (content.title as string) || artifact.title || 'Untitled',
      meta_description: (content.meta_description as string) || '',
      content_markdown: (content.content_markdown as string) || '',
      excerpt: (content.excerpt as string) || '',
      tags: (content.tags as string[]) || [],
      category: (content.category as string) || 'Blog',
      read_time_minutes: (content.estimated_read_time_minutes as number) || 5,
      seo_keywords: ((content.seo_keywords as Array<{ keyword: string }>) || []).map(
        (k) => k.keyword || (k as unknown as string),
      ),
    };

    if (!post.slug || !post.content_markdown) {
      return { success: false, error: 'Artifact missing slug or content_markdown' };
    }

    // Get brand name for the page template
    const { brands } = await import('@quadbot/db');
    const [brand] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1);
    const brandName = brand?.name || 'Blog';

    try {
      const result = await createBlogPostPR(token, config, post, brandName);

      // Update artifact status
      await db
        .update(artifacts)
        .set({ status: 'published', updated_at: new Date() })
        .where(eq(artifacts.id, artifact_id));

      // Update publish config last_published_at
      await db
        .update(contentPublishConfigs)
        .set({ last_published_at: new Date(), updated_at: new Date() })
        .where(eq(contentPublishConfigs.id, publishConfig.id));

      logger.info(
        {
          brandId,
          artifactId: artifact_id,
          prUrl: result.prUrl,
          prNumber: result.prNumber,
        },
        'Blog post published via GitHub PR',
      );

      return {
        success: true,
        result: {
          pr_url: result.prUrl,
          pr_number: result.prNumber,
          branch: result.branch,
          slug: post.slug,
          published_url: `${config.site_url}/blog/${post.slug}`,
          format: config.content_format,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'GitHub publish failed';
      logger.error({ brandId, artifact_id, error: msg }, 'GitHub publish failed');
      return { success: false, error: msg };
    }
  },
};
```

**Step 2: Register the executor**

In the executor registry file (`apps/worker/src/executors/index.ts` or wherever executors are registered), import and add `githubPublishExecutor`.

**Step 3: Commit**

```bash
git add apps/worker/src/executors/github-publish.ts apps/worker/src/executors/index.ts
git commit -m "feat: add github-publish executor — creates PRs with blog posts"
```

---

## Task 4: GitHub CMS Connector — Configuration UI

**Files:**

- Create: `apps/web/src/app/brands/[id]/settings/github/page.tsx`
- Create: `apps/web/src/app/api/brands/[id]/publish-config/route.ts`

**Step 1: Create publish config API route**

Create `apps/web/src/app/api/brands/[id]/publish-config/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentPublishConfigs } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { requireSession } from '@/lib/auth-session';
import { encrypt } from '@quadbot/db/encryption';
import { withRateLimit } from '@/lib/rate-limit';

async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id: brandId } = await context.params;

  const configs = await db
    .select({
      id: contentPublishConfigs.id,
      type: contentPublishConfigs.type,
      name: contentPublishConfigs.name,
      config: contentPublishConfigs.config,
      is_active: contentPublishConfigs.is_active,
      last_published_at: contentPublishConfigs.last_published_at,
    })
    .from(contentPublishConfigs)
    .where(eq(contentPublishConfigs.brand_id, brandId));

  return NextResponse.json({ configs });
}

async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id: brandId } = await context.params;
  const body = await req.json();

  const { name, owner, repo, branch, blog_directory, content_format, site_url, auto_merge, github_token } = body;

  if (!owner || !repo || !blog_directory || !site_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const config = {
    owner,
    repo,
    branch: branch || 'main',
    blog_directory,
    content_format: content_format || 'nextjs_page',
    site_url,
    auto_merge: auto_merge ?? false,
  };

  const [created] = await db
    .insert(contentPublishConfigs)
    .values({
      brand_id: brandId,
      type: 'github',
      name: name || `${owner}/${repo}`,
      config,
      github_token_encrypted: github_token ? encrypt(github_token) : null,
    })
    .returning();

  return NextResponse.json({ config: created });
}

export { GET, POST };
```

**Step 2: Create GitHub settings page**

Create `apps/web/src/app/brands/[id]/settings/github/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Github, Check, ExternalLink } from 'lucide-react';

type PublishConfig = {
  id: string;
  type: string;
  name: string;
  config: {
    owner: string;
    repo: string;
    branch: string;
    blog_directory: string;
    content_format: string;
    site_url: string;
    auto_merge: boolean;
  };
  is_active: boolean;
  last_published_at: string | null;
};

export default function GitHubSettingsPage() {
  const params = useParams();
  const brandId = params.id as string;
  const [configs, setConfigs] = useState<PublishConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [blogDir, setBlogDir] = useState('app/blog');
  const [format, setFormat] = useState('nextjs_page');
  const [siteUrl, setSiteUrl] = useState('');
  const [autoMerge, setAutoMerge] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => {
    fetch(`/api/brands/${brandId}/publish-config`)
      .then((r) => r.json())
      .then((data) => setConfigs(data.configs))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [brandId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/publish-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          blog_directory: blogDir,
          content_format: format,
          site_url: siteUrl,
          auto_merge: autoMerge,
          github_token: token,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfigs((prev) => [...prev, data.config]);
        setShowForm(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Publishing
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect a GitHub repo so QuadBot can publish blog posts as pull requests.
          </p>
        </div>
        {!showForm && <Button onClick={() => setShowForm(true)}>Connect Repository</Button>}
      </div>

      {/* Existing configs */}
      {configs.map((cfg) => (
        <Card key={cfg.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Github className="h-4 w-4" />
              {cfg.config.owner}/{cfg.config.repo}
              <Badge variant={cfg.is_active ? 'default' : 'secondary'}>{cfg.is_active ? 'Active' : 'Inactive'}</Badge>
            </CardTitle>
            <CardDescription>
              Branch: {cfg.config.branch} &middot; Format: {cfg.config.content_format} &middot; Directory:{' '}
              {cfg.config.blog_directory}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {cfg.last_published_at
                ? `Last published: ${new Date(cfg.last_published_at).toLocaleDateString()}`
                : 'No posts published yet'}
            </span>
            <a
              href={`https://github.com/${cfg.config.owner}/${cfg.config.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              View Repo <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      ))}

      {/* New config form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Connect GitHub Repository</CardTitle>
            <CardDescription>QuadBot will create pull requests with new blog posts in your repo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Repository Owner</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. matthewtrundle"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Repository Name</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. lonestartorts"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Branch</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Blog Directory</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  placeholder="app/blog"
                  value={blogDir}
                  onChange={(e) => setBlogDir(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Site URL</label>
                <input
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  placeholder="https://lonestartortillas.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Content Format</label>
                <select
                  className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="nextjs_page">Next.js Page (page.tsx)</option>
                  <option value="mdx">MDX</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">GitHub Personal Access Token</label>
              <input
                type="password"
                className="mt-1 w-full rounded border bg-background px-3 py-2 text-sm"
                placeholder="ghp_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Needs &quot;repo&quot; scope. Token is encrypted at rest.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoMerge}
                onChange={(e) => setAutoMerge(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label className="text-sm">Auto-merge PRs (skip review)</label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || !owner || !repo || !siteUrl}>
                {saving ? 'Saving...' : 'Connect Repository'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/brands/\[id\]/settings/github/ apps/web/src/app/api/brands/\[id\]/publish-config/
git commit -m "feat: add GitHub CMS configuration UI and API"
```

---

## Task 5: Wire Content Automation to GitHub Publisher

**Files:**

- Modify: `apps/worker/src/jobs/content-automation.ts`

**Step 1: Update content automation to use github-publish executor**

In `apps/worker/src/jobs/content-automation.ts`, modify the action draft creation (lines 87-99) to check for a GitHub publish config and use the `github-publish` executor type instead of `content-publisher` when one exists:

```typescript
import { contentPublishConfigs } from '@quadbot/db';

// After generating content and finding the artifact, before creating the action draft:

// Check if brand has a GitHub publish config
const [githubConfig] = await db
  .select({ id: contentPublishConfigs.id })
  .from(contentPublishConfigs)
  .where(
    and(
      eq(contentPublishConfigs.brand_id, brandId),
      eq(contentPublishConfigs.type, 'github'),
      eq(contentPublishConfigs.is_active, true),
    ),
  )
  .limit(1);

const executorType = githubConfig ? 'github-publish' : 'content-publisher';
const publishPayload = githubConfig
  ? { artifact_id: generated.id, publish_config_id: githubConfig.id }
  : { artifact_id: generated.id };

if (brief.recommendation_id) {
  await db.insert(actionDrafts).values({
    brand_id: brandId,
    recommendation_id: brief.recommendation_id,
    type: executorType,
    payload: publishPayload,
    risk: 'medium',
    guardrails_applied: {},
    requires_approval: true,
    status: 'pending',
  });
  // ... emit event
}
```

**Step 2: Commit**

```bash
git add apps/worker/src/jobs/content-automation.ts
git commit -m "feat: wire content automation to use github-publish when configured"
```

---

## Task 6: Content Refresh Automation — Wire Decay Detector to Content Writer

**Files:**

- Modify: `packages/shared/src/constants.ts` (add CONTENT_DECAY_DETECTED event type)
- Modify: `apps/worker/src/jobs/content-decay-detector.ts` (emit event)
- Modify: `apps/worker/src/seed-event-rules.ts` (add decay → content_automation rule)

**Step 1: Add CONTENT_DECAY_DETECTED event type**

In `packages/shared/src/constants.ts`, add to EventType:

```typescript
  CONTENT_DECAY_DETECTED: 'content_decay.detected',
```

**Step 2: Emit event from decay detector**

In `apps/worker/src/jobs/content-decay-detector.ts`, after creating recommendations (around line 255), add:

```typescript
// After the for loop that creates recommendations:
if (created > 0) {
  await emitEvent(
    EventType.CONTENT_DECAY_DETECTED,
    brandId,
    {
      decaying_page_count: created,
      top_page: top10[0]?.page,
      max_decay_score: top10[0]?.decay_score,
    },
    `decay:${brandId}:${new Date().toISOString().split('T')[0]}`,
    'content_decay_detector',
  );
}
```

**Step 3: Add event rule to wire decay detection to content automation**

In `apps/worker/src/seed-event-rules.ts`, add to DEFAULT_RULES:

```typescript
  {
    event_type: EventType.CONTENT_DECAY_DETECTED,
    job_type: JobType.CONTENT_AUTOMATION,
    conditions: {},
    enabled: true,
  },
```

**Step 4: Commit**

```bash
git add packages/shared/src/constants.ts apps/worker/src/jobs/content-decay-detector.ts apps/worker/src/seed-event-rules.ts
git commit -m "feat: wire content decay detection to content automation pipeline"
```

---

## Task 7: PageSpeed / Core Web Vitals Monitor

**Files:**

- Create: `apps/worker/src/jobs/pagespeed-monitor.ts`
- Modify: `packages/shared/src/constants.ts` (add job type)
- Modify: `apps/worker/src/registry.ts` (register job)
- Modify: `apps/worker/src/cron.ts` (schedule weekly)

**Step 1: Add PAGESPEED_MONITOR job type**

In `packages/shared/src/constants.ts`, add to JobType:

```typescript
  PAGESPEED_MONITOR: 'pagespeed_monitor',
```

**Step 2: Create pagespeed monitor job**

Create `apps/worker/src/jobs/pagespeed-monitor.ts`:

```typescript
import { brands, brandIntegrations, metricSnapshots, recommendations } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

type PageSpeedResult = {
  lighthouseResult: {
    categories: {
      performance: { score: number };
    };
    audits: {
      'largest-contentful-paint': { numericValue: number; displayValue: string };
      'cumulative-layout-shift': { numericValue: number; displayValue: string };
      'total-blocking-time': { numericValue: number; displayValue: string };
      'first-contentful-paint': { numericValue: number; displayValue: string };
      'speed-index': { numericValue: number; displayValue: string };
      interactive: { numericValue: number; displayValue: string };
    };
  };
};

/**
 * PageSpeed Monitor
 * Runs Google PageSpeed Insights on brand's key pages.
 * Stores results as metric_snapshots and creates recommendations for poor scores.
 *
 * Uses the FREE Google PageSpeed Insights API (no key required, rate limited).
 * Optional: PAGESPEED_API_KEY env var for higher rate limits.
 */
export async function pagespeedMonitor(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'pagespeed_monitor' }, 'PageSpeed_Monitor starting');

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  // Get site URL from GSC integration
  const [integration] = await db
    .select({ config: brandIntegrations.config })
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'google_search_console')))
    .limit(1);

  const config = integration?.config as Record<string, unknown> | undefined;
  const siteUrl = (config?.siteUrl as string) || (config?.site_url as string);

  if (!siteUrl) {
    logger.info({ jobId, brandId }, 'No site URL found, skipping PageSpeed check');
    return;
  }

  // Normalize the URL
  const baseUrl = siteUrl.replace(/\/$/, '').replace('sc-domain:', 'https://');

  // Check homepage + any high-traffic pages from payload
  const pagesToCheck = [baseUrl];
  const extraPages = ctx.payload.pages as string[] | undefined;
  if (extraPages) {
    pagesToCheck.push(...extraPages.slice(0, 4)); // Max 5 total
  }

  const apiKey = process.env.PAGESPEED_API_KEY;
  let checksCompleted = 0;

  for (const pageUrl of pagesToCheck) {
    try {
      const params = new URLSearchParams({
        url: pageUrl,
        strategy: 'mobile',
        category: 'performance',
      });
      if (apiKey) params.set('key', apiKey);

      const response = await fetch(`${PAGESPEED_API}?${params}`);
      if (!response.ok) {
        logger.warn({ pageUrl, status: response.status }, 'PageSpeed API error');
        continue;
      }

      const data = (await response.json()) as PageSpeedResult;
      const lighthouse = data.lighthouseResult;
      const performanceScore = lighthouse.categories.performance.score * 100;
      const audits = lighthouse.audits;

      // Store metric snapshots
      const metrics = [
        { key: 'performance_score', value: performanceScore },
        { key: 'lcp_ms', value: audits['largest-contentful-paint']?.numericValue || 0 },
        { key: 'cls', value: audits['cumulative-layout-shift']?.numericValue || 0 },
        { key: 'tbt_ms', value: audits['total-blocking-time']?.numericValue || 0 },
        { key: 'fcp_ms', value: audits['first-contentful-paint']?.numericValue || 0 },
        { key: 'speed_index_ms', value: audits['speed-index']?.numericValue || 0 },
      ];

      for (const metric of metrics) {
        await db.insert(metricSnapshots).values({
          brand_id: brandId,
          source: 'pagespeed',
          metric_key: metric.key,
          value: metric.value,
          dimensions: { page_url: pageUrl, strategy: 'mobile' },
        });
      }

      // Create recommendation if performance is poor
      if (performanceScore < 50) {
        const lcpDisplay = audits['largest-contentful-paint']?.displayValue || 'N/A';
        const clsDisplay = audits['cumulative-layout-shift']?.displayValue || 'N/A';
        const tbtDisplay = audits['total-blocking-time']?.displayValue || 'N/A';

        const [rec] = await db
          .insert(recommendations)
          .values({
            brand_id: brandId,
            job_id: jobId,
            source: 'pagespeed_monitor',
            priority: performanceScore < 25 ? 'critical' : 'high',
            title: `Poor page speed: ${pageUrl} (score: ${performanceScore})`,
            body: `**Performance Score:** ${performanceScore}/100 (mobile)\n\n**Core Web Vitals:**\n- LCP: ${lcpDisplay}\n- CLS: ${clsDisplay}\n- TBT: ${tbtDisplay}\n\n**Impact:** Poor page speed directly affects SEO rankings and user experience. Google uses Core Web Vitals as a ranking signal.\n\n**Recommended Actions:**\n- Optimize images (use WebP, lazy loading)\n- Reduce JavaScript bundle size\n- Implement font preloading\n- Enable compression\n- Review server response times`,
            data: {
              page_url: pageUrl,
              performance_score: performanceScore,
              lcp_ms: audits['largest-contentful-paint']?.numericValue,
              cls: audits['cumulative-layout-shift']?.numericValue,
              tbt_ms: audits['total-blocking-time']?.numericValue,
            },
          })
          .returning();

        await emitEvent(
          EventType.RECOMMENDATION_CREATED,
          brandId,
          { recommendation_id: rec.id, source: 'pagespeed_monitor', priority: rec.priority },
          `pagespeed:${pageUrl}:${new Date().toISOString().split('T')[0]}`,
          'pagespeed_monitor',
        );
      }

      checksCompleted++;

      // Rate limit: wait 2s between checks
      if (pagesToCheck.indexOf(pageUrl) < pagesToCheck.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      logger.warn({ pageUrl, err: (err as Error).message }, 'PageSpeed check failed for page');
    }
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'pagespeed_monitor',
      checksCompleted,
      totalPages: pagesToCheck.length,
      durationMs: Date.now() - startTime,
    },
    'PageSpeed_Monitor completed',
  );
}
```

**Step 3: Register in registry and add to cron (weekly schedule)**

In `apps/worker/src/registry.ts`, import and register `pagespeedMonitor`.

In `apps/worker/src/cron.ts`, add a weekly schedule:

```typescript
// PageSpeed check — weekly on Mondays at 6 AM
scheduleJob('pagespeed_monitor', '0 6 * * 1', JobType.PAGESPEED_MONITOR);
```

**Step 4: Commit**

```bash
git add apps/worker/src/jobs/pagespeed-monitor.ts packages/shared/src/constants.ts apps/worker/src/registry.ts apps/worker/src/cron.ts
git commit -m "feat: add PageSpeed / Core Web Vitals monitor (free Google API)"
```

---

## Task 8: Cross-Brand Benchmarks Dashboard

**Files:**

- Create: `apps/web/src/app/dashboard/benchmarks/page.tsx`
- Create: `apps/web/src/app/api/dashboard/benchmarks/route.ts`

**Step 1: Create benchmarks API route**

Create `apps/web/src/app/api/dashboard/benchmarks/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { metricSnapshots } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { requireSession, type UserWithBrand } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireSession();
  const brandId = (session.user as UserWithBrand).brandId;
  if (!brandId) {
    return NextResponse.json({ error: 'No brand' }, { status: 400 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get benchmark snapshots for this brand
  const benchmarks = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.brand_id, brandId),
        eq(metricSnapshots.source, 'benchmark'),
        gte(metricSnapshots.captured_at, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(metricSnapshots.captured_at));

  // Get PageSpeed snapshots
  const pagespeed = await db
    .select()
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.brand_id, brandId),
        eq(metricSnapshots.source, 'pagespeed'),
        gte(metricSnapshots.captured_at, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(metricSnapshots.captured_at));

  return NextResponse.json({ benchmarks, pagespeed });
}
```

**Step 2: Create benchmarks dashboard page**

Create `apps/web/src/app/dashboard/benchmarks/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown, Gauge, Zap } from 'lucide-react';

type MetricSnapshot = {
  id: string;
  metric_key: string;
  value: number;
  source: string;
  dimensions: Record<string, unknown>;
  captured_at: string;
};

type BenchmarkData = {
  benchmarks: MetricSnapshot[];
  pagespeed: MetricSnapshot[];
};

function formatMetricName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPercentileLabel(percentile: number): { label: string; color: string } {
  if (percentile >= 75) return { label: 'Top 25%', color: 'text-green-600' };
  if (percentile >= 50) return { label: 'Above Median', color: 'text-blue-600' };
  if (percentile >= 25) return { label: 'Below Median', color: 'text-yellow-600' };
  return { label: 'Bottom 25%', color: 'text-red-600' };
}

export default function BenchmarksPage() {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/benchmarks')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading benchmarks...</div>;
  }

  if (!data) return null;

  // Group benchmarks by metric_key, take most recent
  const benchmarkMap = new Map<string, MetricSnapshot>();
  for (const b of data.benchmarks) {
    if (!benchmarkMap.has(b.metric_key)) {
      benchmarkMap.set(b.metric_key, b);
    }
  }

  // Get latest PageSpeed scores
  const latestPageSpeed = new Map<string, MetricSnapshot>();
  for (const ps of data.pagespeed) {
    if (!latestPageSpeed.has(ps.metric_key)) {
      latestPageSpeed.set(ps.metric_key, ps);
    }
  }

  const performanceScore = latestPageSpeed.get('performance_score');
  const lcp = latestPageSpeed.get('lcp_ms');
  const cls = latestPageSpeed.get('cls');
  const tbt = latestPageSpeed.get('tbt_ms');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Benchmarks & Performance
        </h2>
        <p className="text-sm text-muted-foreground">See how your brand compares to others in your industry</p>
      </div>

      {/* PageSpeed / CWV Section */}
      {performanceScore && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Core Web Vitals
            </CardTitle>
            <CardDescription>Latest PageSpeed Insights (mobile)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Performance Score</p>
                <p
                  className={`text-3xl font-bold ${
                    performanceScore.value >= 90
                      ? 'text-green-600'
                      : performanceScore.value >= 50
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  {Math.round(performanceScore.value)}
                </p>
              </div>
              {lcp && (
                <div>
                  <p className="text-sm text-muted-foreground">LCP</p>
                  <p className="text-2xl font-bold">{(lcp.value / 1000).toFixed(1)}s</p>
                  <Badge variant={lcp.value < 2500 ? 'default' : lcp.value < 4000 ? 'secondary' : 'destructive'}>
                    {lcp.value < 2500 ? 'Good' : lcp.value < 4000 ? 'Needs Work' : 'Poor'}
                  </Badge>
                </div>
              )}
              {cls && (
                <div>
                  <p className="text-sm text-muted-foreground">CLS</p>
                  <p className="text-2xl font-bold">{cls.value.toFixed(3)}</p>
                  <Badge variant={cls.value < 0.1 ? 'default' : cls.value < 0.25 ? 'secondary' : 'destructive'}>
                    {cls.value < 0.1 ? 'Good' : cls.value < 0.25 ? 'Needs Work' : 'Poor'}
                  </Badge>
                </div>
              )}
              {tbt && (
                <div>
                  <p className="text-sm text-muted-foreground">TBT</p>
                  <p className="text-2xl font-bold">{Math.round(tbt.value)}ms</p>
                  <Badge variant={tbt.value < 200 ? 'default' : tbt.value < 600 ? 'secondary' : 'destructive'}>
                    {tbt.value < 200 ? 'Good' : tbt.value < 600 ? 'Needs Work' : 'Poor'}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Industry Benchmarks */}
      {benchmarkMap.size > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Industry Benchmarks</CardTitle>
            <CardDescription>Your metrics vs other brands in your vertical</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from(benchmarkMap.entries()).map(([key, snapshot]) => {
                const dims = snapshot.dimensions as Record<string, number>;
                const brandValue = dims.brand_value as number;
                const median = dims.median as number;
                const percentileRank = dims.percentile_rank as number;
                const { label, color } = getPercentileLabel(percentileRank);
                const isAbove = brandValue >= median;

                return (
                  <div key={key} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div className="flex items-center gap-3">
                      {isAbove ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">{formatMetricName(key)}</p>
                        <p className="text-xs text-muted-foreground">
                          Your value: {typeof brandValue === 'number' ? brandValue.toFixed(2) : brandValue} &middot;{' '}
                          Industry median: {typeof median === 'number' ? median.toFixed(2) : median}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={color}>
                      {label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Zap className="mx-auto h-8 w-8 mb-2" />
            <p>Benchmark data will appear after the benchmark generator runs.</p>
            <p className="text-xs mt-1">Requires at least 3 brands in your industry vertical.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 3: Add benchmarks tab to dashboard layout**

In `apps/web/src/app/dashboard/layout.tsx`, add a "Benchmarks" tab linking to `/dashboard/benchmarks`.

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/benchmarks/ apps/web/src/app/api/dashboard/benchmarks/ apps/web/src/app/dashboard/layout.tsx
git commit -m "feat: add benchmarks & PageSpeed dashboard"
```

---

## Task 9: Content Calendar View

**Files:**

- Create: `apps/web/src/app/brands/[id]/content/calendar/page.tsx`
- Create: `apps/web/src/app/api/brands/[id]/content-calendar/route.ts`

**Step 1: Create content calendar API**

Create `apps/web/src/app/api/brands/[id]/content-calendar/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { artifacts, actionDrafts, campaigns } from '@quadbot/db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { requireSession } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id: brandId } = await context.params;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  // Get content artifacts (drafts and published)
  const contentArtifacts = await db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      type: artifacts.type,
      status: artifacts.status,
      created_at: artifacts.created_at,
      updated_at: artifacts.updated_at,
    })
    .from(artifacts)
    .where(and(eq(artifacts.brand_id, brandId), gte(artifacts.created_at, thirtyDaysAgo)))
    .orderBy(desc(artifacts.created_at))
    .limit(50);

  // Get pending/approved content publish actions
  const publishActions = await db
    .select({
      id: actionDrafts.id,
      type: actionDrafts.type,
      status: actionDrafts.status,
      payload: actionDrafts.payload,
      created_at: actionDrafts.created_at,
    })
    .from(actionDrafts)
    .where(and(eq(actionDrafts.brand_id, brandId), eq(actionDrafts.type, 'content-publisher')))
    .orderBy(desc(actionDrafts.created_at))
    .limit(50);

  // Get active outreach campaigns
  const activeCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      created_at: campaigns.created_at,
    })
    .from(campaigns)
    .where(eq(campaigns.brand_id, brandId))
    .orderBy(desc(campaigns.created_at))
    .limit(20);

  // Build calendar events
  const calendarEvents = [
    ...contentArtifacts.map((a) => ({
      id: a.id,
      title: a.title || 'Untitled',
      type: a.type === 'generated_content' ? 'content' : 'brief',
      status: a.status,
      date: a.created_at,
    })),
    ...publishActions.map((a) => ({
      id: a.id,
      title: `Publish: ${(a.payload as Record<string, string>)?.title || 'Content'}`,
      type: 'publish_action',
      status: a.status,
      date: a.created_at,
    })),
    ...activeCampaigns.map((c) => ({
      id: c.id,
      title: c.name,
      type: 'campaign',
      status: c.status,
      date: c.created_at,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ events: calendarEvents });
}
```

**Step 2: Create content calendar page**

Create `apps/web/src/app/brands/[id]/content/calendar/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, FileText, Send, Megaphone } from 'lucide-react';

type CalendarEvent = {
  id: string;
  title: string;
  type: 'content' | 'brief' | 'publish_action' | 'campaign';
  status: string;
  date: string;
};

const typeConfig = {
  content: { icon: FileText, label: 'Content', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  brief: {
    icon: FileText,
    label: 'Brief',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  publish_action: {
    icon: Send,
    label: 'Publish',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  campaign: {
    icon: Megaphone,
    label: 'Campaign',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  },
};

export default function ContentCalendarPage() {
  const params = useParams();
  const brandId = params.id as string;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/content-calendar`)
      .then((r) => r.json())
      .then((data) => setEvents(data.events))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading calendar...</div>;
  }

  // Group events by date
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const dateKey = new Date(event.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const existing = eventsByDate.get(dateKey) || [];
    existing.push(event);
    eventsByDate.set(dateKey, existing);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Content Calendar</h2>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Calendar className="mx-auto h-8 w-8 mb-2" />
            <p>No content activity yet. Generate content briefs to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(eventsByDate.entries()).map(([dateStr, dayEvents]) => (
            <Card key={dateStr}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{dateStr}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dayEvents.map((event) => {
                  const config = typeConfig[event.type];
                  const Icon = config.icon;
                  return (
                    <div key={event.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{event.title}</p>
                          <Badge variant="outline" className={`text-xs ${config.color}`}>
                            {config.label}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="secondary">{event.status}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/brands/\[id\]/content/calendar/ apps/web/src/app/api/brands/\[id\]/content-calendar/
git commit -m "feat: add content calendar view"
```

---

## Task 10: MCP Tool — Trigger GitHub Publish

**Files:**

- Modify: `packages/mcp-server/` (add publish tool)

**Step 1: Add trigger_github_publish MCP tool**

This allows triggering content publishing directly from the MCP interface. The tool should:

1. Accept an artifact_id
2. Load the content publish config for the brand
3. Create a `github-publish` action draft (pending approval)

Follow the pattern of existing MCP tools like `trigger_content_writer`. The tool creates an action draft and returns it for approval.

**Step 2: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: add trigger_github_publish MCP tool"
```

---

## Verification Checklist

After all tasks complete:

1. **Schema:** Run `pnpm turbo db:migrate` — verify `content_publish_configs` table exists
2. **GitHub Config:** Visit `/brands/{id}/settings/github` — add Lone Star repo config
3. **GitHub Publish:** Create a test content artifact → approve the github-publish action draft → verify PR appears on GitHub
4. **Content Refresh:** Run content_decay_detector → verify it emits CONTENT_DECAY_DETECTED event → verify content_automation job is triggered
5. **PageSpeed:** Run pagespeed_monitor job → verify metric_snapshots stored with source='pagespeed'
6. **Benchmarks:** Visit `/dashboard/benchmarks` — verify PageSpeed data renders
7. **Calendar:** Visit `/brands/{id}/content/calendar` — verify events render
8. **Build:** Run `pnpm turbo build` — verify no TypeScript errors

---

## Architecture Summary

```
Content Decay Detected ──event──→ Content Automation ──artifact──→ Content Writer
                                                                         │
                                                               generated_content artifact
                                                                         │
                                                              ┌──────────┴──────────┐
                                                              │                     │
                                                    has github config?        no github config
                                                              │                     │
                                                    github-publish          content-publisher
                                                    (creates PR)           (writes to disk)
                                                              │
                                                     GitHub PR created
                                                              │
                                                   ┌──────────┴──────────┐
                                                   │                     │
                                             auto_merge=true       auto_merge=false
                                                   │                     │
                                             squash merge         wait for review
                                                   │                     │
                                              Vercel deploys        Human reviews
                                                   │                     │
                                              GSC index request    merge → deploy
```

## End-to-End Flow for Lone Star

1. Content Decay Detector finds `/blog/texas-bbq-championship-guide` losing traffic
2. Emits `content_decay.detected` event
3. Event rule triggers Content Automation job
4. Content Automation creates a content brief, calls Content Writer
5. Content Writer generates a refreshed blog post as `generated_content` artifact
6. Content Automation sees GitHub config for `matthewtrundle/lonestartorts`, creates `github-publish` action draft
7. You approve the action draft in QuadBot dashboard
8. GitHub Publish executor creates a PR on the Lone Star repo with a `page.tsx` file matching the existing blog format
9. You review the PR on GitHub, merge it
10. Vercel auto-deploys the updated blog post
11. GSC index request is auto-created to tell Google about the update
