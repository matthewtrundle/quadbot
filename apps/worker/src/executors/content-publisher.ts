import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { artifacts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { logger } from '../logger.js';

export interface ContentPublisherPayload {
  artifact_id: string;
  publish_path?: string;
  url_prefix?: string;
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
