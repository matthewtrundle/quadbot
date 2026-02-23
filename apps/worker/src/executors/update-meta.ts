import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { artifacts } from '@quadbot/db';
import { logger } from '../logger.js';

/**
 * Update Meta executor — Phase 1: generates a content brief artifact
 * with proposed title/description changes.
 * Phase 2 will integrate with CMS APIs (WordPress, Shopify, etc.)
 */
export const updateMetaExecutor: Executor = {
  type: 'update-meta',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;
    const url = payload.url as string | undefined;
    const newTitle = payload.new_title as string | undefined;
    const newDescription = payload.new_description as string | undefined;

    if (!url) {
      return { success: false, error: 'Missing required field: url' };
    }

    if (!newTitle && !newDescription) {
      return { success: false, error: 'Must provide at least one of: new_title, new_description' };
    }

    logger.info({ brandId, actionDraftId, url, newTitle, newDescription }, 'Creating meta update artifact');

    // Generate the content brief artifact with proposed changes
    const content: Record<string, unknown> = {
      url,
      changes: [],
    };

    const changes: Array<{ field: string; proposed_value: string }> = [];
    if (newTitle) changes.push({ field: 'title', proposed_value: newTitle });
    if (newDescription) changes.push({ field: 'meta_description', proposed_value: newDescription });
    content.changes = changes;

    // Generate HTML snippet for easy copy-paste
    const htmlSnippet: string[] = [];
    if (newTitle) htmlSnippet.push(`<title>${newTitle}</title>`);
    if (newDescription) htmlSnippet.push(`<meta name="description" content="${newDescription}">`);
    content.html_snippet = htmlSnippet.join('\n');

    await db.insert(artifacts).values({
      brand_id: brandId,
      type: 'meta_update',
      title: `Meta update for ${url}`,
      content,
      status: 'draft',
    });

    return {
      success: true,
      result: {
        url,
        changes,
        artifact_type: 'meta_update',
        note: 'Content brief created — apply changes manually or via CMS integration',
      },
    };
  },
};
