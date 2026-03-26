import { artifacts, actionDrafts, contentPublishConfigs } from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';
import { EventType } from '@quadbot/shared';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { contentWriter } from './content-writer.js';
import { tryAutoApprove } from '../lib/auto-approve.js';

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
 */
export async function contentAutomation(ctx: JobContext): Promise<void> {
  const { db, brandId, jobId, payload } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'content_automation' }, 'Content_Automation starting');

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

  logger.info(
    {
      jobId,
      brandId,
      count: briefsWithoutContent.length,
    },
    'Processing content briefs',
  );

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
        .where(and(eq(artifacts.parent_artifact_id, brief.id), eq(artifacts.type, 'generated_content')))
        .limit(1);

      if (!generated) {
        logger.warn({ briefId: brief.id }, 'Content generation completed but artifact not found');
        continue;
      }

      // Create publish action draft (only if we have a recommendation_id)
      if (brief.recommendation_id) {
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

        const [publishDraft] = await db
          .insert(actionDrafts)
          .values({
            brand_id: brandId,
            recommendation_id: brief.recommendation_id,
            type: executorType,
            payload: publishPayload,
            risk: 'medium',
            guardrails_applied: {},
            requires_approval: true,
            status: 'pending',
          })
          .returning();

        await emitEvent(
          EventType.ACTION_DRAFT_CREATED,
          brandId,
          {
            type: executorType,
            artifact_id: generated.id,
            title: generated.title,
          },
          `content-draft:${generated.id}`,
          'content_automation',
        );

        // Auto-approve if brand is in auto mode
        await tryAutoApprove(db, {
          draftId: publishDraft.id,
          brandId,
          actionType: executorType,
          actionRisk: 'medium',
          recommendationId: brief.recommendation_id,
          source: 'content_automation',
        });
      }

      logger.info(
        {
          jobId,
          brandId,
          briefId: brief.id,
          generatedId: generated.id,
          title: generated.title,
        },
        'Content generated and publish draft created',
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ jobId, brandId, briefId: brief.id, error: msg }, 'Content automation failed for brief');
      // Continue with next brief
    }
  }

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'content_automation',
      briefsProcessed: briefsWithoutContent.length,
      durationMs: Date.now() - startTime,
    },
    'Content_Automation completed',
  );
}
