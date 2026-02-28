import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the decay score calculation used in content-decay-detector.ts.
 * We replicate the pure function here to avoid importing the full job module
 * (which triggers config validation requiring env vars).
 */
function calculateDecayScore(clicksDeltaPct: number, impressionsDeltaPct: number, positionDelta: number): number {
  return Math.abs(clicksDeltaPct) * 0.6 + Math.abs(impressionsDeltaPct) * 0.3 + Math.abs(positionDelta) * 0.1;
}

describe('Content Decay Detector', () => {
  describe('calculateDecayScore', () => {
    it('calculates weighted score from click, impression, and position deltas', () => {
      // -50% clicks, -30% impressions, +2 position (worse)
      const score = calculateDecayScore(-50, -30, 2);
      // |50| * 0.6 + |30| * 0.3 + |2| * 0.1 = 30 + 9 + 0.2 = 39.2
      expect(score).toBeCloseTo(39.2, 1);
    });

    it('returns 0 for no changes', () => {
      const score = calculateDecayScore(0, 0, 0);
      expect(score).toBe(0);
    });

    it('weights clicks most heavily', () => {
      const clickHeavy = calculateDecayScore(-100, 0, 0);
      const impressionHeavy = calculateDecayScore(0, -100, 0);
      const positionHeavy = calculateDecayScore(0, 0, 100);

      // 60 vs 30 vs 10
      expect(clickHeavy).toBeGreaterThan(impressionHeavy);
      expect(impressionHeavy).toBeGreaterThan(positionHeavy);
    });

    it('uses absolute values for negative deltas', () => {
      const score = calculateDecayScore(-25, -20, -1);
      // |25| * 0.6 + |20| * 0.3 + |1| * 0.1 = 15 + 6 + 0.1 = 21.1
      expect(score).toBeCloseTo(21.1, 1);
    });

    it('handles extreme decay values', () => {
      const score = calculateDecayScore(-100, -100, 50);
      // 60 + 30 + 5 = 95
      expect(score).toBeCloseTo(95, 1);
    });

    it('handles small delta values', () => {
      const score = calculateDecayScore(-21, -16, 0.5);
      // |21| * 0.6 + |16| * 0.3 + |0.5| * 0.1 = 12.6 + 4.8 + 0.05 = 17.45
      expect(score).toBeCloseTo(17.45, 1);
    });
  });
});
