import { actionDrafts, actionExecutions } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { Database } from '@quadbot/db';
import { logger } from './logger.js';
import { emitEvent } from './event-emitter.js';
import { EventType } from '@quadbot/shared';

export function startExecutionLoop(db: Database, intervalMs = 30000): NodeJS.Timeout {
  logger.info({ intervalMs }, 'Execution loop started');

  return setInterval(async () => {
    try {
      const approved = await db
        .select()
        .from(actionDrafts)
        .where(eq(actionDrafts.status, 'approved'));

      for (const draft of approved) {
        logger.info(
          { draftId: draft.id, type: draft.type, brandId: draft.brand_id },
          `Would execute [${draft.type}] for brand [${draft.brand_id}]`,
        );

        await db
          .update(actionDrafts)
          .set({ status: 'executed_stub', updated_at: new Date() })
          .where(eq(actionDrafts.id, draft.id));

        const [execution] = await db.insert(actionExecutions).values({
          action_draft_id: draft.id,
          status: 'stubbed',
          result: { message: `Stub execution of ${draft.type}`, executed_at: new Date().toISOString() },
        }).returning();

        // Emit action.executed event
        await emitEvent(
          EventType.ACTION_EXECUTED,
          draft.brand_id,
          { action_draft_id: draft.id, execution_id: execution.id, type: draft.type },
          `exec:${execution.id}`,
          'execution_loop',
        );

        logger.info({ draftId: draft.id }, 'Action stub-executed');
      }
    } catch (err) {
      logger.error({ err }, 'Execution loop error');
    }
  }, intervalMs);
}
