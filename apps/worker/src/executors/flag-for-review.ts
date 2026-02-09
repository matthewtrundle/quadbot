/**
 * Flag for Review Executor
 * Marks an action draft as requiring human attention.
 * Logs prominently and stores the flag context for the dashboard.
 *
 * Future: integrate with email/Slack notifications.
 */

import type { Executor, ExecutorContext, ExecutorResult } from './types.js';
import { recommendations, actionDrafts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';

export const flagForReviewExecutor: Executor = {
  type: 'flag_for_review',

  async execute(context: ExecutorContext): Promise<ExecutorResult> {
    const { db, brandId, actionDraftId, payload } = context;

    const reason = (payload.reason as string) || 'Flagged for human review';
    const urgency = (payload.urgency as string) || 'normal';
    const category = (payload.category as string) || 'general';

    // Get the action draft to find the linked recommendation
    const [draft] = await db
      .select()
      .from(actionDrafts)
      .where(eq(actionDrafts.id, actionDraftId))
      .limit(1);

    let recommendationTitle = 'Unknown';
    if (draft?.recommendation_id) {
      const [rec] = await db
        .select({ title: recommendations.title })
        .from(recommendations)
        .where(eq(recommendations.id, draft.recommendation_id))
        .limit(1);
      if (rec) {
        recommendationTitle = rec.title;
      }
    }

    // Log prominently so it shows up in monitoring
    logger.warn(
      {
        brandId,
        actionDraftId,
        reason,
        urgency,
        category,
        recommendationTitle,
      },
      `FLAG FOR REVIEW: ${recommendationTitle}`,
    );

    // Emit an event so the dashboard and event processor can pick it up
    await emitEvent(
      EventType.ACTION_EXECUTED,
      brandId,
      {
        action_draft_id: actionDraftId,
        executor_type: 'flag_for_review',
        reason,
        urgency,
        category,
        recommendation_title: recommendationTitle,
      },
      `flag:${actionDraftId}`,
      'flag_for_review_executor',
    );

    return {
      success: true,
      result: {
        flagged: true,
        reason,
        urgency,
        category,
        recommendation_title: recommendationTitle,
        timestamp: new Date().toISOString(),
        notification_channel: 'dashboard', // Future: 'email', 'slack'
      },
    };
  },
};
