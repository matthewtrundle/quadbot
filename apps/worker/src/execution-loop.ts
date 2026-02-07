import { actionDrafts, actionExecutions } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { Database } from '@quadbot/db';
import { logger } from './logger.js';
import { emitEvent } from './event-emitter.js';
import { EventType } from '@quadbot/shared';
import { getExecutor } from './executors/registry.js';
import type { ExecutorContext } from './executors/types.js';

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
          `Executing [${draft.type}] for brand [${draft.brand_id}]`,
        );

        const executor = getExecutor(draft.type);

        if (!executor) {
          // No executor registered for this type - use stub behavior
          logger.warn(
            { draftId: draft.id, type: draft.type },
            'No executor registered for action type, using stub',
          );

          await db
            .update(actionDrafts)
            .set({ status: 'executed_stub', updated_at: new Date() })
            .where(eq(actionDrafts.id, draft.id));

          const [execution] = await db.insert(actionExecutions).values({
            action_draft_id: draft.id,
            status: 'stubbed',
            result: { message: `No executor for ${draft.type}`, executed_at: new Date().toISOString() },
          }).returning();

          await emitEvent(
            EventType.ACTION_EXECUTED,
            draft.brand_id,
            { action_draft_id: draft.id, execution_id: execution.id, type: draft.type },
            `exec:${execution.id}`,
            'execution_loop',
          );

          continue;
        }

        // Execute with the registered executor
        const context: ExecutorContext = {
          db,
          brandId: draft.brand_id,
          actionDraftId: draft.id,
          type: draft.type,
          payload: (draft.payload as Record<string, unknown>) || {},
        };

        try {
          const result = await executor.execute(context);

          if (result.success) {
            await db
              .update(actionDrafts)
              .set({ status: 'executed', updated_at: new Date() })
              .where(eq(actionDrafts.id, draft.id));

            const [execution] = await db.insert(actionExecutions).values({
              action_draft_id: draft.id,
              status: 'success',
              result: {
                ...result.result,
                executed_at: new Date().toISOString(),
              },
            }).returning();

            await emitEvent(
              EventType.ACTION_EXECUTED,
              draft.brand_id,
              { action_draft_id: draft.id, execution_id: execution.id, type: draft.type, success: true },
              `exec:${execution.id}`,
              'execution_loop',
            );

            logger.info({ draftId: draft.id, type: draft.type }, 'Action executed successfully');
          } else {
            // Mark as executed but record the failure in action_executions
            await db
              .update(actionDrafts)
              .set({ status: 'executed', updated_at: new Date() })
              .where(eq(actionDrafts.id, draft.id));

            const [execution] = await db.insert(actionExecutions).values({
              action_draft_id: draft.id,
              status: 'failed',
              result: {
                error: result.error,
                executed_at: new Date().toISOString(),
              },
            }).returning();

            await emitEvent(
              EventType.ACTION_EXECUTED,
              draft.brand_id,
              { action_draft_id: draft.id, execution_id: execution.id, type: draft.type, success: false, error: result.error },
              `exec:${execution.id}`,
              'execution_loop',
            );

            logger.error({ draftId: draft.id, type: draft.type, error: result.error }, 'Action execution failed');
          }
        } catch (executorError) {
          // Executor threw an exception
          const errorMessage = executorError instanceof Error ? executorError.message : 'Unknown executor error';

          // Mark as executed but record the failure in action_executions
          await db
            .update(actionDrafts)
            .set({ status: 'executed', updated_at: new Date() })
            .where(eq(actionDrafts.id, draft.id));

          const [execution] = await db.insert(actionExecutions).values({
            action_draft_id: draft.id,
            status: 'failed',
            result: {
              error: errorMessage,
              executed_at: new Date().toISOString(),
            },
          }).returning();

          await emitEvent(
            EventType.ACTION_EXECUTED,
            draft.brand_id,
            { action_draft_id: draft.id, execution_id: execution.id, type: draft.type, success: false, error: errorMessage },
            `exec:${execution.id}`,
            'execution_loop',
          );

          logger.error({ draftId: draft.id, type: draft.type, err: executorError }, 'Executor threw exception');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Execution loop error');
    }
  }, intervalMs);
}
