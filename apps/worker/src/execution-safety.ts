import { brands, executionRules, executionBudgets } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger.js';

const MAX_DAILY_EXECUTIONS = 20;
const MAX_DAILY_SPEND_DELTA_CENTS = 5000; // $50

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Pre-execution safety checks that run before every executor.
 * Returns { allowed: true } or { allowed: false, reason: '...' }.
 */
export async function validateExecution(
  db: Database,
  draft: {
    id: string;
    brand_id: string;
    type: string;
    risk: string;
    status: string;
    payload: Record<string, unknown>;
  },
): Promise<SafetyCheckResult> {
  // 1. Manually approved drafts skip auto-execute checks
  const manuallyApproved = draft.status === 'approved';

  // 2. Get brand
  const [brand] = await db.select().from(brands).where(eq(brands.id, draft.brand_id)).limit(1);
  if (!brand) {
    return { allowed: false, reason: 'Brand not found' };
  }

  // 3. Brand must be in assist or auto mode
  if (brand.mode !== 'assist' && brand.mode !== 'auto') {
    return { allowed: false, reason: `Brand is in '${brand.mode}' mode, must be 'assist' or 'auto' to execute` };
  }

  // 4. Check execution rules (only for auto-executed, not manually approved)
  if (!manuallyApproved) {
    const [rules] = await db.select().from(executionRules).where(eq(executionRules.brand_id, draft.brand_id)).limit(1);

    if (!rules || !rules.auto_execute) {
      return { allowed: false, reason: 'Auto-execute is not enabled for this brand' };
    }

    // Risk check
    const riskLevels: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const draftRisk = riskLevels[draft.risk] ?? 2;
    const maxRisk = riskLevels[rules.max_risk] ?? 1;
    if (draftRisk > maxRisk) {
      return { allowed: false, reason: `Action risk '${draft.risk}' exceeds max allowed '${rules.max_risk}'` };
    }

    // Action type allowlist
    const allowed = rules.allowed_action_types as string[];
    if (allowed && allowed.length > 0 && !allowed.includes(draft.type)) {
      return { allowed: false, reason: `Action type '${draft.type}' is not in the allowed list` };
    }
  }

  // 5. Check daily execution budget
  const today = new Date().toISOString().slice(0, 10);
  const [budget] = await db
    .select()
    .from(executionBudgets)
    .where(and(eq(executionBudgets.brand_id, draft.brand_id), eq(executionBudgets.date, today)))
    .limit(1);

  if (budget) {
    if (budget.executions_count >= MAX_DAILY_EXECUTIONS) {
      return { allowed: false, reason: `Daily execution limit reached (${MAX_DAILY_EXECUTIONS})` };
    }

    // For ads-related actions, check spend delta
    if (draft.type.startsWith('ads-') && budget.spend_delta_cents >= MAX_DAILY_SPEND_DELTA_CENTS) {
      return { allowed: false, reason: `Daily ads spend change limit reached ($${MAX_DAILY_SPEND_DELTA_CENTS / 100})` };
    }
  }

  return { allowed: true };
}

/**
 * Increment the daily execution count for a brand.
 */
export async function recordExecution(db: Database, brandId: string, spendDeltaCents = 0): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const [existing] = await db
    .select()
    .from(executionBudgets)
    .where(and(eq(executionBudgets.brand_id, brandId), eq(executionBudgets.date, today)))
    .limit(1);

  if (existing) {
    await db
      .update(executionBudgets)
      .set({
        executions_count: existing.executions_count + 1,
        spend_delta_cents: existing.spend_delta_cents + Math.abs(spendDeltaCents),
        updated_at: new Date(),
      })
      .where(eq(executionBudgets.id, existing.id));
  } else {
    await db.insert(executionBudgets).values({
      brand_id: brandId,
      date: today,
      executions_count: 1,
      spend_delta_cents: Math.abs(spendDeltaCents),
    });
  }

  logger.info({ brandId, date: today, spendDeltaCents }, 'Execution recorded in budget');
}
