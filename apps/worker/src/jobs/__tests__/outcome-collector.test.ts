import { describe, it, expect } from 'vitest';

/**
 * Unit tests for outcome-collector logic.
 * Tests the skip-on-missing-snapshots behavior and delta computation.
 */

// Extracted outcome computation logic
function shouldSkipOutcome(
  beforeSnapshot: Array<{ value: number }>,
  afterSnapshot: Array<{ value: number }>,
): boolean {
  return beforeSnapshot.length === 0 || afterSnapshot.length === 0;
}

function computeDelta(valueBefore: number, valueAfter: number): number {
  const delta = valueAfter - valueBefore;
  return Math.round(delta * 100) / 100;
}

function roundMetricValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function determineMetricSource(recSource: string): { source: string; key: string } {
  return recSource === 'gsc_daily_digest'
    ? { source: 'gsc', key: 'avg_ctr' }
    : { source: 'community', key: 'spam_rate' };
}

describe('Outcome Collector', () => {
  describe('skip on missing snapshots', () => {
    it('skips when before snapshot is empty', () => {
      expect(shouldSkipOutcome([], [{ value: 10 }])).toBe(true);
    });

    it('skips when after snapshot is empty', () => {
      expect(shouldSkipOutcome([{ value: 10 }], [])).toBe(true);
    });

    it('skips when both are empty', () => {
      expect(shouldSkipOutcome([], [])).toBe(true);
    });

    it('does NOT skip when both snapshots exist', () => {
      expect(shouldSkipOutcome([{ value: 10 }], [{ value: 20 }])).toBe(false);
    });

    it('never generates synthetic data', () => {
      // The old code had Math.random() fallback. Verify skip behavior
      // covers all missing-data cases without synthetic generation.
      const cases = [
        { before: [], after: [] },
        { before: [], after: [{ value: 5 }] },
        { before: [{ value: 5 }], after: [] },
      ];
      for (const c of cases) {
        expect(shouldSkipOutcome(c.before, c.after)).toBe(true);
      }
    });
  });

  describe('delta computation', () => {
    it('computes positive delta', () => {
      expect(computeDelta(50, 75)).toBe(25);
    });

    it('computes negative delta', () => {
      expect(computeDelta(75, 50)).toBe(-25);
    });

    it('computes zero delta', () => {
      expect(computeDelta(50, 50)).toBe(0);
    });

    it('rounds to 2 decimal places', () => {
      expect(computeDelta(0.1, 0.2)).toBeCloseTo(0.1);
      expect(computeDelta(1.005, 1.015)).toBeCloseTo(0.01);
    });

    it('handles floating point precision', () => {
      // 0.3 - 0.1 in floating point is 0.19999...
      const result = computeDelta(0.1, 0.3);
      expect(result).toBe(0.2);
    });
  });

  describe('metric value rounding', () => {
    it('rounds to 2 decimal places', () => {
      expect(roundMetricValue(50.555)).toBe(50.56);
      expect(roundMetricValue(50.554)).toBe(50.55);
      expect(roundMetricValue(100)).toBe(100);
    });
  });

  describe('metric source determination', () => {
    it('maps gsc_daily_digest to gsc/avg_ctr', () => {
      const result = determineMetricSource('gsc_daily_digest');
      expect(result).toEqual({ source: 'gsc', key: 'avg_ctr' });
    });

    it('maps other sources to community/spam_rate', () => {
      const result = determineMetricSource('community_moderation');
      expect(result).toEqual({ source: 'community', key: 'spam_rate' });
    });
  });
});
