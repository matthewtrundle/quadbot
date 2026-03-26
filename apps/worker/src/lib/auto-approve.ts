import { actionDrafts, brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type { Database } from '@quadbot/db';
import { emitEvent } from '../event-emitter.js';
import { EventType } from '@quadbot/shared';
import { logger } from '../logger.js';

const AUTO_APPROVE_TYPES = new Set([
  'github-publish',
  'content-publisher',
  'gsc-index-request',
  'gsc-inspection',
  'gsc-sitemap-notify',
  'update_content',
  'update_meta',
  'publish_post',
]);

const AUTO_BLOCK_TYPES = new Set(['flag_for_review', 'general']);

const riskLevels: Record<string, number> = { low: 1, medium: 2, high: 3 };

/**
 * Check if an action draft should be auto-approved based on brand mode,
 * action type, and risk level. If so, update its status to 'approved'.
 *
 * Call this after inserting any action draft to ensure auto-approve
 * logic is applied consistently across all code paths.
 */
export async function tryAutoApprove(
  db: Database,
  opts: {
    draftId: string;
    brandId: string;
    actionType: string;
    actionRisk: string;
    recommendationId: string;
    source?: string;
  },
): Promise<boolean> {
  const brand = await db.select({ mode: brands.mode }).from(brands).where(eq(brands.id, opts.brandId)).limit(1);
  if (brand.length === 0) return false;

  if (brand[0].mode !== 'auto') return false;

  const draftRiskLevel = riskLevels[opts.actionRisk] ?? 3;
  const isSafeType =
    AUTO_APPROVE_TYPES.has(opts.actionType) &&
    !AUTO_BLOCK_TYPES.has(opts.actionType) &&
    !opts.actionType.startsWith('ads-');
  const isSafeRisk = draftRiskLevel <= 2; // low or medium

  if (!isSafeType || !isSafeRisk) {
    logger.info(
      { draftId: opts.draftId, type: opts.actionType, risk: opts.actionRisk, isSafeType, isSafeRisk },
      'Action draft requires manual approval (blocked by auto mode safety)',
    );
    return false;
  }

  await db
    .update(actionDrafts)
    .set({ status: 'approved', updated_at: new Date() })
    .where(eq(actionDrafts.id, opts.draftId));

  await emitEvent(
    EventType.ACTION_DRAFT_APPROVED,
    opts.brandId,
    {
      action_draft_id: opts.draftId,
      recommendation_id: opts.recommendationId,
      auto_approved: true,
      mode: 'auto',
      source: opts.source || 'auto_approve',
    },
    `auto-approved:${opts.draftId}`,
    opts.source || 'auto_approve',
  );

  logger.info(
    { draftId: opts.draftId, type: opts.actionType, risk: opts.actionRisk, source: opts.source },
    'Action draft auto-approved by auto mode',
  );

  return true;
}
