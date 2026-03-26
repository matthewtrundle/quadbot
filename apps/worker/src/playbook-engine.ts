import { playbooks, recommendations, actionDrafts } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger.js';
import { tryAutoApprove } from './lib/auto-approve.js';

type Playbook = typeof playbooks.$inferSelect;

/**
 * Phase 7A: Playbook Engine
 * Matches recommendations against active playbooks for a brand.
 * Returns applicable playbook context for the strategic prioritizer.
 */
export async function getPlaybookContext(
  db: Database,
  brandId: string,
  recommendations: { source: string; priority: string; type?: string }[],
): Promise<string> {
  const activePlaybooks = await db
    .select()
    .from(playbooks)
    .where(and(eq(playbooks.brand_id, brandId), eq(playbooks.is_active, true)));

  if (activePlaybooks.length === 0) return '';

  const matched: { playbook: Playbook; reason: string }[] = [];

  for (const playbook of activePlaybooks) {
    const conditions = playbook.trigger_conditions as {
      sources?: string[];
      min_priority?: string;
      recommendation_types?: string[];
      keywords?: string[];
    };

    for (const rec of recommendations) {
      let matches = false;
      let reason = '';

      // Source match
      if (conditions.sources && conditions.sources.includes(rec.source)) {
        matches = true;
        reason = `source=${rec.source}`;
      }

      // Priority match
      if (conditions.min_priority) {
        const levels: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
        const recLevel = levels[rec.priority] || 0;
        const minLevel = levels[conditions.min_priority] || 0;
        if (recLevel >= minLevel) {
          matches = true;
          reason += ` priority=${rec.priority}`;
        }
      }

      // Type match
      if (conditions.recommendation_types && rec.type) {
        if (conditions.recommendation_types.includes(rec.type)) {
          matches = true;
          reason += ` type=${rec.type}`;
        }
      }

      if (matches) {
        matched.push({ playbook, reason: reason.trim() });
        break; // One match per playbook is enough
      }
    }
  }

  if (matched.length === 0) return '';

  // Format as context string for Claude
  const lines = matched.map((m) => {
    const actions = m.playbook.actions as { description?: string }[];
    const actionSummary = actions.map((a) => a.description || 'action').join(', ');
    return `- **${m.playbook.name}** (trigger: ${m.reason}): ${actionSummary}`;
  });

  return lines.join('\n');
}

/**
 * Execute playbook actions when a recommendation matches.
 * For now, this auto-creates action drafts based on playbook rules.
 */
export async function executePlaybook(
  db: Database,
  brandId: string,
  recommendationId: string,
  playbook: Playbook,
): Promise<void> {
  const actions = playbook.actions as {
    type: string;
    payload?: Record<string, unknown>;
    risk?: string;
    description?: string;
  }[];

  for (const action of actions) {
    const actionType = action.type || 'flag_for_review';
    const actionRisk = (action.risk as 'low' | 'medium' | 'high') || 'low';

    const [draft] = await db
      .insert(actionDrafts)
      .values({
        brand_id: brandId,
        recommendation_id: recommendationId,
        type: actionType,
        payload: action.payload || {},
        risk: actionRisk,
        status: 'pending',
        guardrails_applied: { playbook_id: playbook.id, playbook_name: playbook.name },
      })
      .returning();

    // Auto-approve if brand is in auto mode
    await tryAutoApprove(db, {
      draftId: draft.id,
      brandId,
      actionType,
      actionRisk,
      recommendationId,
      source: 'playbook_engine',
    });
  }

  // Update playbook run stats
  await db
    .update(playbooks)
    .set({
      run_count: playbook.run_count + 1,
      last_run_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(playbooks.id, playbook.id));

  logger.info(
    {
      playbookId: playbook.id,
      playbookName: playbook.name,
      recommendationId,
      actionsCreated: actions.length,
    },
    'Playbook executed',
  );
}
