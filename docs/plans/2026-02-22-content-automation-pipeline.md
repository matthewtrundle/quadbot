# Content Automation Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an end-to-end pipeline that takes trend content briefs, writes full blog posts via LLM, publishes to a target (Markdown files in a git repo initially), and submits the published URL to Google Search Console for indexing.

**Architecture:** New job `content_writer` generates full content from existing `trend_content_brief` artifacts. A `content_publisher` executor writes to a configurable target (git repo markdown files as v1, with CMS adapters later). After publishing, auto-creates a `gsc-index-request` action draft to submit the URL for indexing. The entire flow is triggered by a new cron or manually via MCP/UI.

**Tech Stack:** Claude LLM (existing `callClaude`), Git operations (simple-git), Resend (notifications), Google Indexing API (existing `gsc-api.ts`)

---

## What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| Trend content briefs | Done | `trend-scan.ts` creates `trend_content_brief` artifacts |
| Content brief → prompt | Done | MCP tool `get_content_prompt_from_brief` |
| Artifact storage | Done | `artifacts` table with JSONB `content` field |
| Action draft system | Done | `action-draft-generator.ts` + approval flow |
| GSC index submission | Done | `gsc-index-request` executor |
| GSC API + token mgmt | Done | `gsc-api.ts` with auto-refresh |
| LLM infrastructure | Done | `callClaude` with usage tracking |
| Prompt loader | Done | `loadActivePrompt` pattern |

## What We Need to Build

| Component | Purpose |
|-----------|---------|
| `content_writer` job | Generates full blog post from content brief |
| `content_writer_v1` prompt | LLM prompt for writing the actual post |
| `content-publisher` executor | Publishes content to target destination |
| `content_automation` job | Orchestrator: write → publish → submit to GSC |
| Brand integration config | Blog URL pattern, publish target settings |
| UI: Content pipeline view | Shows generated content, approval, publish status |
| GitHub Action (optional) | Auto-deploy blog content from repo |

---

## Task 1: Content Writer Prompt Template

**Files:**
- Modify: `apps/worker/src/seed-prompts.ts`
- Modify: `packages/shared/src/schemas/prompts.ts`

**Step 1: Add output schema for generated content**

In `packages/shared/src/schemas/prompts.ts`, add:

```typescript
export const contentWriterOutputSchema = z.object({
  title: z.string().min(10).max(200),
  slug: z.string().min(5).max(100).describe('URL-friendly slug'),
  meta_description: z.string().min(50).max(160),
  content_markdown: z.string().min(500).describe('Full article in Markdown format'),
  excerpt: z.string().min(50).max(300).describe('Short excerpt for previews/social'),
  tags: z.array(z.string()).min(1).max(10),
  estimated_read_time_minutes: z.number().int().min(1),
  seo_keywords: z.array(z.object({
    keyword: z.string(),
    usage_count: z.number().int().describe('How many times used in content'),
  })),
  social_snippets: z.object({
    twitter: z.string().max(280).optional(),
    linkedin: z.string().max(700).optional(),
  }).optional(),
});
```

**Step 2: Add prompt template**

In `apps/worker/src/seed-prompts.ts`, add a `content_writer_v1` prompt:

```
You are an expert content writer. Given a content brief, write a complete, publish-ready blog post.

## Content Brief
{content_brief}

## Brand Context
Brand: {brand_name}
Industry: {industry}
Tone: {tone_guidance}

## Requirements
- Write in Markdown format
- Target word count: {target_word_count} words
- Include all sections from the outline
- Naturally incorporate the provided SEO keywords
- Write a compelling introduction that hooks the reader
- Include a clear conclusion with a call-to-action
- Use subheadings (##, ###) for structure
- Keep paragraphs short (2-4 sentences)
- Include data points and specific examples where possible
- Write in the specified tone

## Output
Return the complete article with metadata.
```

**Step 3: Export schema from shared package**

Add `contentWriterOutputSchema` to the exports in `packages/shared/src/index.ts`.

**Step 4: Build and verify**

Run: `pnpm --filter @quadbot/shared build`

**Step 5: Commit**

```bash
git add packages/shared/src/schemas/prompts.ts packages/shared/src/index.ts apps/worker/src/seed-prompts.ts
git commit -m "feat: add content writer prompt template and output schema"
```

---

## Task 2: Content Writer Job

**Files:**
- Create: `apps/worker/src/jobs/content-writer.ts`
- Modify: `apps/worker/src/index.ts` (register handler)
- Modify: `packages/shared/src/constants.ts` (add JobType)

**Step 1: Add job type constant**

In `packages/shared/src/constants.ts`, add to JobType:

```typescript
CONTENT_WRITER: 'content_writer',
CONTENT_AUTOMATION: 'content_automation',
```

**Step 2: Create the content writer job**

Create `apps/worker/src/jobs/content-writer.ts`:

```typescript
import { artifacts, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { contentWriterOutputSchema } from '@quadbot/shared';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { callClaude } from '../claude.js';
import { loadActivePrompt } from '../prompt-loader.js';

/**
 * Content Writer Job
 * Takes a trend_content_brief artifact and generates a full blog post.
 *
 * Payload:
 *   artifact_id: string - the trend_content_brief artifact to write from
 *   platform: 'blog' | 'social' | 'email' (default: 'blog')
 *   target_word_count?: number (default: 1500)
 */
export async function contentWriter(ctx: JobContext): Promise<void> {
  const { db, brandId, jobId, payload } = ctx;

  const artifactId = payload.artifact_id as string;
  const platform = (payload.platform as string) || 'blog';
  const targetWordCount = (payload.target_word_count as number) || 1500;

  if (!artifactId) throw new Error('Missing required payload: artifact_id');

  // Load the content brief artifact
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1);

  if (!artifact) throw new Error(`Artifact ${artifactId} not found`);
  if (artifact.type !== 'trend_content_brief') {
    throw new Error(`Artifact ${artifactId} is type '${artifact.type}', expected 'trend_content_brief'`);
  }

  // Load brand for context
  const [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const briefContent = artifact.content as Record<string, unknown>;

  // Extract tone guidance
  const toneGuidance = briefContent.tone_guidance as Record<string, string> | undefined;
  const tone = toneGuidance?.recommended_tone || 'professional and informative';

  // Build content brief summary for the LLM
  const contentBriefJson = JSON.stringify(briefContent, null, 2);

  // Load prompt and call LLM
  const prompt = await loadActivePrompt('content_writer_v1');

  const result = await callClaude(
    prompt,
    {
      content_brief: contentBriefJson,
      brand_name: brand.name,
      industry: (brand.guardrails as Record<string, unknown>)?.industry || 'general',
      tone_guidance: tone,
      target_word_count: String(targetWordCount),
    },
    contentWriterOutputSchema,
    { retries: 2, trackUsage: { db, brandId, jobId } },
  );

  // Store as new artifact
  const [generatedArtifact] = await db
    .insert(artifacts)
    .values({
      brand_id: brandId,
      recommendation_id: artifact.recommendation_id,
      type: 'generated_content',
      title: result.data.title,
      content: {
        ...result.data,
        source_brief_id: artifactId,
        platform,
        generated_at: new Date().toISOString(),
      },
      parent_artifact_id: artifactId,
      status: 'draft',
    })
    .returning();

  logger.info({
    jobId,
    brandId,
    artifactId: generatedArtifact.id,
    title: result.data.title,
    wordCount: result.data.content_markdown.split(/\s+/).length,
    platform,
  }, 'Content generated from brief');
}
```

**Step 3: Register in worker index**

In `apps/worker/src/index.ts`, add:
```typescript
import { contentWriter } from './jobs/content-writer.js';
// In the handlers map:
[JobType.CONTENT_WRITER]: contentWriter,
```

**Step 4: Build and verify**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add apps/worker/src/jobs/content-writer.ts apps/worker/src/index.ts packages/shared/src/constants.ts
git commit -m "feat: add content writer job — generates full posts from content briefs"
```

---

## Task 3: Content Publisher Executor

**Files:**
- Create: `apps/worker/src/executors/content-publisher.ts`
- Modify: `apps/worker/src/executors/index.ts` (register executor)

**Step 1: Create the content publisher executor**

This v1 publishes by writing a Markdown file to a configurable git repo path. Future versions can add WordPress/CMS adapters.

Create `apps/worker/src/executors/content-publisher.ts`:

```typescript
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { artifacts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { logger } from '../logger.js';

export interface ContentPublisherPayload {
  artifact_id: string;
  publish_path?: string;     // Base path for content files
  url_prefix?: string;       // Base URL for the published content
}

export const contentPublisherExecutor: Executor = {
  type: 'content-publisher',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const { artifact_id, publish_path, url_prefix } = payload as unknown as ContentPublisherPayload;

    if (!artifact_id) {
      return { success: false, error: 'Missing required field: artifact_id' };
    }

    // Load the generated content artifact
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifact_id))
      .limit(1);

    if (!artifact || artifact.type !== 'generated_content') {
      return { success: false, error: `Artifact ${artifact_id} not found or not generated_content type` };
    }

    const content = artifact.content as Record<string, unknown>;
    const markdown = content.content_markdown as string;
    const slug = content.slug as string;
    const title = content.title as string;
    const metaDescription = content.meta_description as string;
    const tags = content.tags as string[];
    const excerpt = content.excerpt as string;

    if (!markdown || !slug) {
      return { success: false, error: 'Artifact missing content_markdown or slug' };
    }

    // Build frontmatter + markdown file
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const frontmatter = [
      '---',
      `title: "${title.replace(/"/g, '\\"')}"`,
      `date: "${now.toISOString()}"`,
      `description: "${(metaDescription || '').replace(/"/g, '\\"')}"`,
      `excerpt: "${(excerpt || '').replace(/"/g, '\\"')}"`,
      `tags: [${(tags || []).map(t => `"${t}"`).join(', ')}]`,
      `slug: "${slug}"`,
      `generated: true`,
      `source_artifact: "${artifact_id}"`,
      '---',
      '',
    ].join('\n');

    const fullContent = frontmatter + markdown;
    const fileName = `${dateStr}-${slug}.md`;

    // Determine output path
    const basePath = publish_path || process.env.CONTENT_PUBLISH_PATH;
    if (!basePath) {
      // Dry run — just return what would be published
      logger.info({ brandId, actionDraftId, fileName }, 'Content publisher dry run (no publish path configured)');
      return {
        success: true,
        result: {
          mode: 'dry_run',
          fileName,
          slug,
          title,
          contentLength: fullContent.length,
          message: 'No CONTENT_PUBLISH_PATH configured. Set it or pass publish_path in payload.',
        },
      };
    }

    // Write file
    try {
      await mkdir(basePath, { recursive: true });
      const filePath = join(basePath, fileName);
      await writeFile(filePath, fullContent, 'utf-8');

      // Update artifact status
      await db
        .update(artifacts)
        .set({
          status: 'published',
          updated_at: now,
        })
        .where(eq(artifacts.id, artifact_id));

      // Compute published URL
      const baseUrl = url_prefix || process.env.CONTENT_URL_PREFIX || '';
      const publishedUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/${slug}` : slug;

      logger.info({
        brandId,
        actionDraftId,
        filePath,
        publishedUrl,
      }, 'Content published');

      return {
        success: true,
        result: {
          filePath,
          fileName,
          slug,
          title,
          publishedUrl,
          contentLength: fullContent.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ brandId, actionDraftId, error: msg }, 'Content publish failed');
      return { success: false, error: msg };
    }
  },
};
```

**Step 2: Register executor**

In `apps/worker/src/executors/index.ts`, add:
```typescript
import { contentPublisherExecutor } from './content-publisher.js';
// In the executors map:
'content-publisher': contentPublisherExecutor,
```

**Step 3: Build and verify**

Run: `pnpm --filter @quadbot/worker build`

**Step 4: Commit**

```bash
git add apps/worker/src/executors/content-publisher.ts apps/worker/src/executors/index.ts
git commit -m "feat: add content publisher executor — writes markdown files with frontmatter"
```

---

## Task 4: Content Automation Orchestrator Job

**Files:**
- Create: `apps/worker/src/jobs/content-automation.ts`
- Modify: `apps/worker/src/index.ts` (register)

**Step 1: Create the orchestrator job**

This job ties the pipeline together: finds unwritten content briefs, generates content, creates publish + GSC submission action drafts.

Create `apps/worker/src/jobs/content-automation.ts`:

```typescript
import { artifacts, recommendations, actionDrafts } from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';
import { EventType } from '@quadbot/shared';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { contentWriter } from './content-writer.js';

/**
 * Content Automation Orchestrator
 *
 * Pipeline:
 * 1. Find trend_content_brief artifacts without generated_content children
 * 2. Generate content for each (calls content writer)
 * 3. Create action drafts for publishing + GSC submission
 *
 * Payload:
 *   max_posts?: number (default: 3) — max posts to generate per run
 *   auto_publish?: boolean (default: false) — skip approval for publishing
 */
export async function contentAutomation(ctx: JobContext): Promise<void> {
  const { db, brandId, jobId, payload } = ctx;

  const maxPosts = (payload.max_posts as number) || 3;

  // Find content briefs that don't have generated_content children
  const briefsWithoutContent = await db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      recommendation_id: artifacts.recommendation_id,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.brand_id, brandId),
        eq(artifacts.type, 'trend_content_brief'),
        sql`NOT EXISTS (
          SELECT 1 FROM artifacts child
          WHERE child.parent_artifact_id = ${artifacts.id}
          AND child.type = 'generated_content'
        )`,
      ),
    )
    .limit(maxPosts);

  if (briefsWithoutContent.length === 0) {
    logger.info({ jobId, brandId }, 'No unwritten content briefs found');
    return;
  }

  logger.info({
    jobId, brandId,
    count: briefsWithoutContent.length,
  }, 'Processing content briefs');

  for (const brief of briefsWithoutContent) {
    try {
      // Generate content
      await contentWriter({
        ...ctx,
        payload: {
          artifact_id: brief.id,
          platform: 'blog',
        },
      });

      // Find the generated artifact
      const [generated] = await db
        .select()
        .from(artifacts)
        .where(
          and(
            eq(artifacts.parent_artifact_id, brief.id),
            eq(artifacts.type, 'generated_content'),
          ),
        )
        .limit(1);

      if (!generated) {
        logger.warn({ briefId: brief.id }, 'Content generation completed but artifact not found');
        continue;
      }

      // Create publish action draft
      await db.insert(actionDrafts).values({
        brand_id: brandId,
        recommendation_id: brief.recommendation_id,
        type: 'content-publisher',
        payload: {
          artifact_id: generated.id,
        },
        risk: 'medium',
        guardrails_applied: {},
        requires_approval: true,
        status: 'pending',
      });

      await emitEvent(
        EventType.ACTION_DRAFT_CREATED,
        brandId,
        {
          type: 'content-publisher',
          artifact_id: generated.id,
          title: generated.title,
        },
        `content-draft:${generated.id}`,
        'content_automation',
      );

      logger.info({
        jobId,
        brandId,
        briefId: brief.id,
        generatedId: generated.id,
        title: generated.title,
      }, 'Content generated and publish draft created');

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ jobId, brandId, briefId: brief.id, error: msg }, 'Content automation failed for brief');
      // Continue with next brief
    }
  }
}
```

**Step 2: Register handler and add cron**

In `apps/worker/src/index.ts`:
```typescript
import { contentAutomation } from './jobs/content-automation.js';
[JobType.CONTENT_AUTOMATION]: contentAutomation,
```

In `apps/worker/src/cron.ts`, add weekly content generation (e.g., Wednesdays 9 AM):
```typescript
{ cron: '0 9 * * 3', jobType: JobType.CONTENT_AUTOMATION, label: 'Weekly content generation' },
```

**Step 3: Build and verify**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add apps/worker/src/jobs/content-automation.ts apps/worker/src/index.ts apps/worker/src/cron.ts
git commit -m "feat: add content automation orchestrator — brief → write → publish draft → GSC"
```

---

## Task 5: Post-Publish GSC Submission Hook

**Files:**
- Modify: `apps/worker/src/executors/content-publisher.ts`
- Modify: `apps/worker/src/event-emitter.ts` (if needed)

**Step 1: After successful publish, auto-create GSC index request**

In the content publisher executor, after a successful file write and when a `publishedUrl` is computed, automatically create a `gsc-index-request` action draft:

```typescript
// After successful publish, create GSC index request
if (publishedUrl && publishedUrl.startsWith('http')) {
  await db.insert(actionDrafts).values({
    brand_id: brandId,
    type: 'gsc-index-request',
    payload: {
      url: publishedUrl,
      action: 'URL_UPDATED',
    },
    risk: 'low',
    guardrails_applied: {},
    requires_approval: false, // Auto-approve GSC submissions
    status: 'approved',
  });

  logger.info({ brandId, publishedUrl }, 'GSC index request created for published content');
}
```

**Step 2: Build and verify**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add apps/worker/src/executors/content-publisher.ts
git commit -m "feat: auto-submit published content URLs to GSC for indexing"
```

---

## Task 6: MCP Tool for Content Pipeline

**Files:**
- Modify: `packages/mcp-server/src/tools/recommendations.ts` (or create new tools file)

**Step 1: Add MCP tool to trigger content writing**

Add a `trigger_content_writer` tool that lets users write content from a brief via MCP:

```typescript
{
  name: 'trigger_content_writer',
  description: 'Generate a full blog post from a trend content brief artifact',
  inputSchema: {
    type: 'object',
    properties: {
      artifact_id: { type: 'string', description: 'The trend_content_brief artifact ID' },
      platform: { type: 'string', enum: ['blog', 'social', 'email'], default: 'blog' },
      target_word_count: { type: 'number', default: 1500 },
    },
    required: ['artifact_id'],
  },
}
```

This triggers a `content_writer` job via the existing job queue.

**Step 2: Build and verify**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add packages/mcp-server/src/tools/
git commit -m "feat: add MCP tool to trigger content writing from briefs"
```

---

## Task 7: UI — Content Pipeline Status View

**Files:**
- Create: `apps/web/src/app/brands/[id]/content/page.tsx`
- Modify: `apps/web/src/components/brand-nav.tsx` (add Content nav item)

**Step 1: Create content pipeline page**

Shows: content briefs waiting to be written, generated drafts pending review, published content with GSC status.

Three sections:
1. **Ready to Write** — `trend_content_brief` artifacts without `generated_content` children
2. **Drafts** — `generated_content` artifacts with status `draft`
3. **Published** — `generated_content` artifacts with status `published`

Each card shows title, source brief, word count, status, and action buttons (Write / Approve / View).

**Step 2: Add to brand nav**

In `apps/web/src/components/brand-nav.tsx`, add:
```typescript
{ label: 'Content', segment: 'content' },
```

Insert after 'Artifacts' in the NAV_ITEMS array.

**Step 3: Build and verify**

Run: `pnpm --filter @quadbot/web build`

**Step 4: Commit**

```bash
git add apps/web/src/app/brands/[id]/content/ apps/web/src/components/brand-nav.tsx
git commit -m "feat: add content pipeline UI page"
```

---

## Task 8: Final Build + Verification

**Step 1: Full build**

Run: `pnpm build`

**Step 2: Run tests**

Run: `pnpm test`

**Step 3: Seed new prompt**

Run: `pnpm --filter @quadbot/worker seed-prompts` (or however prompts are seeded)

**Step 4: Manual verification**

1. Trigger `content_automation` job for a brand with existing trend content briefs
2. Verify `generated_content` artifact created with full markdown
3. Verify action draft created for publishing
4. Approve the publish action
5. Verify file written (or dry run if no CONTENT_PUBLISH_PATH)
6. Verify GSC index request created

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `packages/shared/src/schemas/prompts.ts` | Modify — add contentWriterOutputSchema |
| 2 | `packages/shared/src/index.ts` | Modify — export new schema |
| 3 | `apps/worker/src/seed-prompts.ts` | Modify — add content_writer_v1 prompt |
| 4 | `apps/worker/src/jobs/content-writer.ts` | Create |
| 5 | `apps/worker/src/jobs/content-automation.ts` | Create |
| 6 | `apps/worker/src/executors/content-publisher.ts` | Create |
| 7 | `apps/worker/src/executors/index.ts` | Modify — register executor |
| 8 | `apps/worker/src/index.ts` | Modify — register jobs |
| 9 | `apps/worker/src/cron.ts` | Modify — add weekly cron |
| 10 | `packages/shared/src/constants.ts` | Modify — add JobTypes |
| 11 | `packages/mcp-server/src/tools/recommendations.ts` | Modify — add MCP tool |
| 12 | `apps/web/src/app/brands/[id]/content/page.tsx` | Create |
| 13 | `apps/web/src/components/brand-nav.tsx` | Modify — add Content nav |

## Future Enhancements (Not in This Plan)

- **WordPress adapter** — POST to WP REST API instead of writing markdown files
- **Contentful/Webflow adapters** — CMS-specific publishing
- **Image generation** — Generate hero images for posts via DALL-E/Midjourney
- **Social cross-posting** — Auto-post excerpts to Twitter/LinkedIn after blog publish
- **Content calendar UI** — Schedule content for future dates
- **A/B title testing** — Publish with one title, measure CTR, swap if needed
- **GitHub Action** — Auto-deploy markdown files to a blog repo (Astro/Hugo/Next.js blog)
