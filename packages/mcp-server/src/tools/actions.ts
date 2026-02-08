import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, actionDrafts, events } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { EventType } from '@quadbot/shared';

async function emitEvent(
  type: string,
  brandId: string,
  payload: Record<string, unknown>,
  dedupeKey?: string,
  source: string = 'mcp',
): Promise<string | null> {
  try {
    if (dedupeKey) {
      const existing = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.brand_id, brandId),
            eq(events.type, type),
            eq(events.dedupe_key, dedupeKey),
          ),
        )
        .limit(1);

      if (existing.length > 0) return null;
    }

    const eventId = randomUUID();
    await db.insert(events).values({
      id: eventId,
      brand_id: brandId,
      type,
      payload,
      source,
      dedupe_key: dedupeKey || undefined,
      status: 'new',
    });

    return eventId;
  } catch (err: any) {
    if (err?.code === '23505') return null;
    throw err;
  }
}

export function registerActionTools(server: McpServer) {
  server.tool(
    'list_action_drafts',
    'List pending action drafts',
    {
      brandId: z.string().uuid().optional().describe('Filter by brand'),
      status: z.enum(['pending', 'approved', 'rejected', 'executed_stub', 'executed']).optional().describe('Filter by status (default: pending)'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, status, limit }) => {
      const conditions = [];
      if (brandId) conditions.push(eq(actionDrafts.brand_id, brandId));
      conditions.push(eq(actionDrafts.status, status || 'pending'));

      const results = await db
        .select()
        .from(actionDrafts)
        .where(and(...conditions))
        .orderBy(desc(actionDrafts.created_at))
        .limit(limit || 20);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'approve_action',
    'Approve a pending action draft and emit event',
    { actionId: z.string().uuid().describe('Action draft UUID') },
    async ({ actionId }) => {
      const [updated] = await db
        .update(actionDrafts)
        .set({ status: 'approved', updated_at: new Date() })
        .where(eq(actionDrafts.id, actionId))
        .returning();

      if (!updated) {
        return { content: [{ type: 'text', text: 'Action draft not found' }], isError: true };
      }

      await emitEvent(
        EventType.ACTION_DRAFT_APPROVED,
        updated.brand_id,
        { action_draft_id: updated.id, recommendation_id: updated.recommendation_id },
        `approved:${updated.id}`,
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, action: updated }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'reject_action',
    'Reject a pending action draft and emit event',
    {
      actionId: z.string().uuid().describe('Action draft UUID'),
      reason: z.string().optional().describe('Rejection reason'),
    },
    async ({ actionId, reason }) => {
      const [updated] = await db
        .update(actionDrafts)
        .set({ status: 'rejected', updated_at: new Date() })
        .where(eq(actionDrafts.id, actionId))
        .returning();

      if (!updated) {
        return { content: [{ type: 'text', text: 'Action draft not found' }], isError: true };
      }

      await emitEvent(
        EventType.ACTION_DRAFT_REJECTED,
        updated.brand_id,
        { action_draft_id: updated.id, recommendation_id: updated.recommendation_id, reason },
        `rejected:${updated.id}`,
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, action: updated }, null, 2),
        }],
      };
    },
  );
}
