import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the evaluation scoring math used in evaluation-scorer.ts.
 * Tests the pure computation logic without requiring database access.
 */

// Extracted scoring logic from evaluation-scorer.ts
function computeAcceptanceRate(
  recs: Array<{ status: string; drafts: Array<{ status: string }> }>,
): number {
  if (recs.length === 0) return 0;
  let approvedCount = 0;
  for (const rec of recs) {
    const isDismissed = rec.status === 'dismissed';
    const wasAccepted =
      !isDismissed &&
      rec.drafts.some(
        (d) =>
          d.status === 'approved' ||
          d.status === 'executed_stub' ||
          d.status === 'executed',
      );
    if (wasAccepted) approvedCount++;
  }
  return approvedCount / recs.length;
}

function computeCalibrationError(
  avgConfidence: number | null,
  acceptanceRate: number,
): number | null {
  if (avgConfidence == null) return null;
  return Math.abs(avgConfidence - acceptanceRate);
}

function computeEvaluationScore(
  wasAccepted: boolean,
  outcomeDelta: number | null,
): number {
  const acceptedScore = wasAccepted ? 1.0 : 0.0;
  const outcomeScore =
    outcomeDelta != null
      ? Math.min(Math.max(outcomeDelta / 10, -1), 1)
      : 0;
  return acceptedScore * 0.5 + ((outcomeScore + 1) / 2) * 0.5;
}

describe('Evaluation Scorer - Scoring Math', () => {
  describe('acceptance rate', () => {
    it('computes correctly with mix of accepted/dismissed', () => {
      const recs = [
        { status: 'active', drafts: [{ status: 'approved' }] },
        { status: 'dismissed', drafts: [{ status: 'approved' }] },
        { status: 'active', drafts: [{ status: 'pending' }] },
        { status: 'active', drafts: [{ status: 'executed_stub' }] },
      ];
      // 2 accepted (first + fourth), 4 total
      expect(computeAcceptanceRate(recs)).toBe(0.5);
    });

    it('dismissed recs are not counted as accepted', () => {
      const recs = [
        { status: 'dismissed', drafts: [{ status: 'approved' }] },
        { status: 'dismissed', drafts: [{ status: 'executed' }] },
      ];
      expect(computeAcceptanceRate(recs)).toBe(0);
    });

    it('returns 0 for zero recommendations', () => {
      expect(computeAcceptanceRate([])).toBe(0);
    });

    it('counts executed and executed_stub as accepted', () => {
      const recs = [
        { status: 'active', drafts: [{ status: 'executed' }] },
        { status: 'active', drafts: [{ status: 'executed_stub' }] },
      ];
      expect(computeAcceptanceRate(recs)).toBe(1);
    });
  });

  describe('calibration error', () => {
    it('computes |avgConfidence - acceptanceRate|', () => {
      expect(computeCalibrationError(0.8, 0.6)).toBeCloseTo(0.2);
    });

    it('returns null when avgConfidence is null', () => {
      expect(computeCalibrationError(null, 0.5)).toBeNull();
    });

    it('returns 0 when perfectly calibrated', () => {
      expect(computeCalibrationError(0.7, 0.7)).toBe(0);
    });
  });

  describe('evaluation score', () => {
    it('accepted with positive outcome gives high score', () => {
      const score = computeEvaluationScore(true, 5);
      // acceptedScore = 1.0, outcomeScore = 0.5, normalized = 0.75
      // final = 1.0 * 0.5 + 0.75 * 0.5 = 0.875
      expect(score).toBeCloseTo(0.875);
    });

    it('not accepted with no outcome gives 0.25', () => {
      const score = computeEvaluationScore(false, null);
      // acceptedScore = 0, outcomeScore = 0, normalized = 0.5
      // final = 0 * 0.5 + 0.5 * 0.5 = 0.25
      expect(score).toBeCloseTo(0.25);
    });

    it('accepted with no outcome gives 0.75', () => {
      const score = computeEvaluationScore(true, null);
      // acceptedScore = 1.0, outcomeScore = 0, normalized = 0.5
      // final = 1.0 * 0.5 + 0.5 * 0.5 = 0.75
      expect(score).toBeCloseTo(0.75);
    });

    it('clamps extreme deltas', () => {
      // Very large positive: clamped to 1
      const highScore = computeEvaluationScore(true, 100);
      // outcomeScore = clamp(100/10, -1, 1) = 1, normalized = 1.0
      // final = 0.5 + 1.0 * 0.5 = 1.0
      expect(highScore).toBeCloseTo(1.0);

      // Very large negative: clamped to -1
      const lowScore = computeEvaluationScore(false, -100);
      // outcomeScore = clamp(-10, -1, 1) = -1, normalized = 0
      // final = 0 + 0 = 0
      expect(lowScore).toBeCloseTo(0);
    });
  });
});
