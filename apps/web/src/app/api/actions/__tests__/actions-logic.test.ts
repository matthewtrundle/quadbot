import { describe, it, expect } from 'vitest';

/**
 * Tests for action draft auto-approval business logic.
 * Replicates the pure decision function from the action-draft-generator
 * to validate risk, confidence, and type-based gating rules.
 */

interface AutoApproveOpts {
  autoExecute: boolean;
  actionRisk: string;
  maxRisk: string;
  confidence: number;
  minConfidence: number;
  actionType: string;
  allowedTypes: string[];
}

function shouldAutoApprove(opts: AutoApproveOpts): boolean {
  if (!opts.autoExecute) return false;
  const riskLevels: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const draftRiskLevel = riskLevels[opts.actionRisk] ?? 3;
  const maxRiskLevel = riskLevels[opts.maxRisk] ?? 1;
  const meetsConfidence = opts.confidence >= opts.minConfidence;
  const meetsRisk = draftRiskLevel <= maxRiskLevel;
  const meetsType =
    opts.allowedTypes.length === 0 ||
    opts.allowedTypes.includes(opts.actionType);
  return meetsConfidence && meetsRisk && meetsType;
}

const baseOpts: AutoApproveOpts = {
  autoExecute: true,
  actionRisk: 'low',
  maxRisk: 'medium',
  confidence: 0.9,
  minConfidence: 0.8,
  actionType: 'content_update',
  allowedTypes: ['content_update', 'meta_tag_change'],
};

describe('Action Draft Auto-Approval Logic', () => {
  describe('autoExecute flag', () => {
    it('returns false when autoExecute is false regardless of other criteria', () => {
      expect(shouldAutoApprove({ ...baseOpts, autoExecute: false })).toBe(
        false
      );
    });

    it('proceeds to evaluate criteria when autoExecute is true', () => {
      expect(shouldAutoApprove({ ...baseOpts, autoExecute: true })).toBe(true);
    });
  });

  describe('confidence threshold', () => {
    it('returns true when confidence exceeds minimum', () => {
      expect(
        shouldAutoApprove({ ...baseOpts, confidence: 0.95, minConfidence: 0.8 })
      ).toBe(true);
    });

    it('returns true when confidence exactly equals minimum', () => {
      expect(
        shouldAutoApprove({ ...baseOpts, confidence: 0.8, minConfidence: 0.8 })
      ).toBe(true);
    });

    it('returns false when confidence is below minimum', () => {
      expect(
        shouldAutoApprove({ ...baseOpts, confidence: 0.5, minConfidence: 0.8 })
      ).toBe(false);
    });

    it('returns false when confidence is zero', () => {
      expect(
        shouldAutoApprove({ ...baseOpts, confidence: 0, minConfidence: 0.1 })
      ).toBe(false);
    });
  });

  describe('risk level evaluation', () => {
    it('approves when action risk is lower than max risk', () => {
      expect(
        shouldAutoApprove({ ...baseOpts, actionRisk: 'low', maxRisk: 'high' })
      ).toBe(true);
    });

    it('approves when action risk equals max risk', () => {
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionRisk: 'medium',
          maxRisk: 'medium',
        })
      ).toBe(true);
    });

    it('rejects when action risk exceeds max risk', () => {
      expect(
        shouldAutoApprove({ ...baseOpts, actionRisk: 'high', maxRisk: 'low' })
      ).toBe(false);
    });

    it('rejects medium risk when max is low', () => {
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionRisk: 'medium',
          maxRisk: 'low',
        })
      ).toBe(false);
    });

    it('defaults unknown action risk to highest level (3)', () => {
      // Unknown risk should be treated as high (3), exceeding medium max (2)
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionRisk: 'critical',
          maxRisk: 'medium',
        })
      ).toBe(false);
    });

    it('defaults unknown max risk to lowest level (1)', () => {
      // Unknown maxRisk defaults to 1, so even 'low' (1) action should pass
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionRisk: 'low',
          maxRisk: 'unknown_level',
        })
      ).toBe(true);
    });

    it('rejects medium action when max risk is unknown (defaults to 1)', () => {
      // maxRisk defaults to 1, medium risk is 2 > 1
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionRisk: 'medium',
          maxRisk: 'unknown_level',
        })
      ).toBe(false);
    });
  });

  describe('allowed action types', () => {
    it('approves when action type is in allowed list', () => {
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionType: 'content_update',
          allowedTypes: ['content_update', 'meta_tag_change'],
        })
      ).toBe(true);
    });

    it('rejects when action type is not in allowed list', () => {
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionType: 'delete_page',
          allowedTypes: ['content_update', 'meta_tag_change'],
        })
      ).toBe(false);
    });

    it('allows all types when allowed types array is empty', () => {
      expect(
        shouldAutoApprove({
          ...baseOpts,
          actionType: 'any_type_at_all',
          allowedTypes: [],
        })
      ).toBe(true);
    });
  });

  describe('combined criteria', () => {
    it('requires all criteria to pass simultaneously', () => {
      // All pass
      expect(
        shouldAutoApprove({
          autoExecute: true,
          actionRisk: 'low',
          maxRisk: 'high',
          confidence: 0.95,
          minConfidence: 0.7,
          actionType: 'seo_fix',
          allowedTypes: ['seo_fix'],
        })
      ).toBe(true);
    });

    it('fails when only confidence fails among passing criteria', () => {
      expect(
        shouldAutoApprove({
          autoExecute: true,
          actionRisk: 'low',
          maxRisk: 'high',
          confidence: 0.5,
          minConfidence: 0.7,
          actionType: 'seo_fix',
          allowedTypes: ['seo_fix'],
        })
      ).toBe(false);
    });

    it('fails when only risk fails among passing criteria', () => {
      expect(
        shouldAutoApprove({
          autoExecute: true,
          actionRisk: 'high',
          maxRisk: 'low',
          confidence: 0.95,
          minConfidence: 0.7,
          actionType: 'seo_fix',
          allowedTypes: ['seo_fix'],
        })
      ).toBe(false);
    });

    it('fails when only type fails among passing criteria', () => {
      expect(
        shouldAutoApprove({
          autoExecute: true,
          actionRisk: 'low',
          maxRisk: 'high',
          confidence: 0.95,
          minConfidence: 0.7,
          actionType: 'delete_everything',
          allowedTypes: ['seo_fix'],
        })
      ).toBe(false);
    });
  });
});
