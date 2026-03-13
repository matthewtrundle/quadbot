import { actionDrafts, artifacts, brands, contentPublishConfigs, decrypt } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { createBlogPostPR } from '../lib/github-cms.js';
import type { GitHubCmsConfig, BlogPostContent } from '../lib/github-cms.js';
import { logger } from '../logger.js';

export interface GitHubPublishPayload {
  artifact_id: string;
  publish_config_id?: string;
}

/**
 * Map DB config content_format values to the github-cms library format values.
 */
function mapContentFormat(dbFormat: string): GitHubCmsConfig['content_format'] {
  switch (dbFormat) {
    case 'nextjs_page':
      return 'page.tsx';
    case 'mdx':
      return 'mdx';
    case 'markdown':
      return 'markdown';
    default:
      return 'page.tsx';
  }
}

/**
 * Normalize seo_keywords which may be an array of {keyword: string} objects
 * or plain strings into a comma-separated string.
 */
function normalizeKeywords(raw: unknown): string {
  if (!raw || !Array.isArray(raw)) return '';
  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null && 'keyword' in item) {
        return (item as { keyword: string }).keyword;
      }
      return String(item);
    })
    .join(', ');
}

export const githubPublishExecutor: Executor = {
  type: 'github-publish',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const { artifact_id, publish_config_id } = payload as unknown as GitHubPublishPayload;

    if (!artifact_id) {
      return { success: false, error: 'Missing required field: artifact_id' };
    }

    // 1. Load the generated content artifact
    const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, artifact_id)).limit(1);

    if (!artifact || artifact.type !== 'generated_content') {
      return { success: false, error: `Artifact ${artifact_id} not found or not generated_content type` };
    }

    // 2. Load the GitHub publish config
    let publishConfig;
    if (publish_config_id) {
      const [cfg] = await db
        .select()
        .from(contentPublishConfigs)
        .where(eq(contentPublishConfigs.id, publish_config_id))
        .limit(1);
      publishConfig = cfg;
    } else {
      // Use the first active config for this brand
      const [cfg] = await db
        .select()
        .from(contentPublishConfigs)
        .where(and(eq(contentPublishConfigs.brand_id, brandId), eq(contentPublishConfigs.is_active, true)))
        .limit(1);
      publishConfig = cfg;
    }

    if (!publishConfig) {
      return { success: false, error: 'No active GitHub publish config found for this brand' };
    }

    const config = publishConfig.config as {
      owner: string;
      repo: string;
      branch: string;
      blog_directory: string;
      content_format: string;
      site_url: string;
      auto_merge: boolean;
    };

    // 3. Decrypt the GitHub token (fall back to env var)
    let token: string | undefined;
    if (publishConfig.github_token_encrypted) {
      try {
        token = decrypt(publishConfig.github_token_encrypted);
      } catch (err) {
        logger.warn({ brandId, actionDraftId, err }, 'Failed to decrypt GitHub token, falling back to env');
      }
    }
    token = token || process.env.GITHUB_CMS_TOKEN;

    if (!token) {
      return {
        success: false,
        error: 'No GitHub token available (encrypted token missing and GITHUB_CMS_TOKEN not set)',
      };
    }

    // 4. Extract blog post content from artifact
    const content = artifact.content as Record<string, unknown>;
    const slug = content.slug as string;
    const title = content.title as string;
    const metaDescription = content.meta_description as string;
    const markdown = content.content_markdown as string;
    const excerpt = content.excerpt as string;

    if (!markdown || !slug) {
      return { success: false, error: 'Artifact missing content_markdown or slug' };
    }

    const keywords = normalizeKeywords(content.seo_keywords);
    const category = (content.category as string) || 'Blog';
    const readMinutes = (content.estimated_read_time_minutes as number) || 5;

    // 5. Get the brand name
    const [brand] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1);

    const brandName = brand?.name || 'Unknown Brand';

    // 6. Build the post and CMS config objects
    const now = new Date();
    const blogPost: BlogPostContent = {
      slug,
      title,
      description: metaDescription || '',
      keywords,
      category,
      publishDate: now.toISOString(),
      readTime: `${readMinutes} min read`,
      excerpt: excerpt || '',
      body: markdown,
    };

    const cmsConfig: GitHubCmsConfig = {
      owner: config.owner,
      repo: config.repo,
      base_branch: config.branch || 'main',
      content_path: config.blog_directory,
      content_format: mapContentFormat(config.content_format),
      auto_merge: config.auto_merge ?? false,
    };

    const siteUrl = config.site_url || '';

    // 7. Create the PR
    try {
      const result = await createBlogPostPR(token, cmsConfig, blogPost, brandName, siteUrl);

      // 8. Update artifact status to published
      await db
        .update(artifacts)
        .set({
          status: 'published',
          updated_at: now,
        })
        .where(eq(artifacts.id, artifact_id));

      // 9. Update config's last_published_at
      await db
        .update(contentPublishConfigs)
        .set({
          last_published_at: now,
          updated_at: now,
        })
        .where(eq(contentPublishConfigs.id, publishConfig.id));

      const publishedUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/blog/${slug}` : `/blog/${slug}`;

      // 10. Auto-create GSC index request so Google indexes the new page
      if (publishedUrl.startsWith('http') && artifact.recommendation_id) {
        try {
          await db.insert(actionDrafts).values({
            brand_id: brandId,
            recommendation_id: artifact.recommendation_id,
            type: 'gsc-index-request',
            payload: { url: publishedUrl, action: 'URL_UPDATED' },
            risk: 'low',
            guardrails_applied: { auto_generated: true, source: 'github-publish' },
            requires_approval: false,
            status: 'approved',
          });
          logger.info({ brandId, url: publishedUrl }, 'Auto-created GSC index request for published blog post');
        } catch (gscErr) {
          // Non-fatal — log and continue
          logger.warn({ brandId, url: publishedUrl, err: gscErr }, 'Failed to create GSC index request');
        }
      }

      logger.info(
        {
          brandId,
          actionDraftId,
          prUrl: result.prUrl,
          prNumber: result.prNumber,
          slug,
        },
        'GitHub blog post PR created',
      );

      return {
        success: true,
        result: {
          pr_url: result.prUrl,
          pr_number: result.prNumber,
          branch: result.branch,
          slug,
          published_url: publishedUrl,
          format: cmsConfig.content_format,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ brandId, actionDraftId, error: msg }, 'GitHub publish failed');
      return { success: false, error: msg };
    }
  },
};
