import { actionDrafts, actionExecutions } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { Database } from '@quadbot/db';
import { logger } from './logger.js';
import { Sentry } from './sentry.js';
import { emitEvent } from './event-emitter.js';
import { EventType } from '@quadbot/shared';
import { getExecutor } from './executors/registry.js';
import type { ExecutorContext } from './executors/types.js';
import { validateExecution, recordExecution } from './execution-safety.js';
import { sendNotification } from './lib/notification-sender.js';

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

        // Safety check before execution
        const safety = await validateExecution(db, {
          id: draft.id,
          brand_id: draft.brand_id,
          type: draft.type,
          risk: draft.risk,
          status: draft.status,
          payload: (draft.payload as Record<string, unknown>) || {},
        });

        if (!safety.allowed) {
          logger.warn(
            { draftId: draft.id, type: draft.type, reason: safety.reason },
            'Execution blocked by safety check',
          );
          await sendNotification(db, {
            brand_id: draft.brand_id,
            type: 'safety_blocked',
            title: `Action blocked: ${draft.type}`,
            body: safety.reason || 'Execution safety check failed',
            data: { action_draft_id: draft.id, type: draft.type },
          });
          continue;
        }

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

          await recordExecution(db, draft.brand_id);
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

            await recordExecution(db, draft.brand_id);

            await sendNotification(db, {
              brand_id: draft.brand_id,
              type: 'execution_completed',
              title: `Action completed: ${draft.type}`,
              body: `Successfully executed ${draft.type}`,
              data: { action_draft_id: draft.id, execution_id: execution.id },
            });

            logger.info({ draftId: draft.id, type: draft.type }, 'Action executed successfully');
          } else {
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

            await recordExecution(db, draft.brand_id);

            await sendNotification(db, {
              brand_id: draft.brand_id,
              type: 'execution_failed',
              title: `Action failed: ${draft.type}`,
              body: result.error || 'Execution failed',
              data: { action_draft_id: draft.id, execution_id: execution.id },
            });

            logger.error({ draftId: draft.id, type: draft.type, error: result.error }, 'Action execution failed');
          }
        } catch (executorError) {
          const errorMessage = executorError instanceof Error ? executorError.message : 'Unknown executor error';

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

          await recordExecution(db, draft.brand_id);

          await sendNotification(db, {
            brand_id: draft.brand_id,
            type: 'execution_failed',
            title: `Action error: ${draft.type}`,
            body: errorMessage,
            data: { action_draft_id: draft.id, execution_id: execution.id },
          });

          logger.error({ draftId: draft.id, type: draft.type, err: executorError }, 'Executor threw exception');
          Sentry.captureException(executorError, { extra: { draftId: draft.id, type: draft.type, brandId: draft.brand_id } });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Execution loop error');
      Sentry.captureException(err);
    }
  }, intervalMs);
}
