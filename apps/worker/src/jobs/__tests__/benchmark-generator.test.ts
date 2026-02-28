import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the benchmark computation logic used in benchmark-generator.ts.
 * Tests percentile calculation and benchmark gap detection without database access.
 */

// Replicated from benchmark-generator.ts (private function)
function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);

  if (lower === upper) return sorted[lower];

  const frac = idx - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

// Replicated benchmark gap detection logic
function isUnderperforming(percentileRank: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? percentileRank <= 25 : percentileRank >= 75;
}

function isOutperforming(percentileRank: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? percentileRank >= 75 : percentileRank <= 25;
}

// Replicated percentile rank computation
function computePercentileRank(rank: number, total: number): number {
  return Math.round(((rank + 1) / total) * 100);
}

describe('Benchmark Generator', () => {
  describe('computePercentile', () => {
    it('returns 0 for empty array', () => {
      expect(computePercentile([], 50)).toBe(0);
    });

    it('returns the single value for single-element array', () => {
      expect(computePercentile([42], 50)).toBe(42);
      expect(computePercentile([42], 25)).toBe(42);
      expect(computePercentile([42], 75)).toBe(42);
    });

    it('computes median of [1,2,3] = 2', () => {
      expect(computePercentile([1, 2, 3], 50)).toBe(2);
    });

    it('computes P25 of [1,2,3,4] = 1.75', () => {
      expect(computePercentile([1, 2, 3, 4], 25)).toBe(1.75);
    });

    it('computes P75 of [1,2,3,4] = 3.25', () => {
      expect(computePercentile([1, 2, 3, 4], 75)).toBe(3.25);
    });

    it('handles even-length arrays for median', () => {
      // [1,2,3,4] median: idx = 0.5 * 3 = 1.5, interpolate between 2 and 3
      expect(computePercentile([1, 2, 3, 4], 50)).toBe(2.5);
    });

    it('handles interpolation correctly for 5 elements', () => {
      // [10, 20, 30, 40, 50], P25: idx = 0.25 * 4 = 1.0 -> sorted[1] = 20
      expect(computePercentile([10, 20, 30, 40, 50], 25)).toBe(20);
    });

    it('returns first element for P0', () => {
      expect(computePercentile([1, 2, 3, 4, 5], 0)).toBe(1);
    });

    it('returns last element for P100', () => {
      expect(computePercentile([1, 2, 3, 4, 5], 100)).toBe(5);
    });

    it('interpolates between adjacent values', () => {
      // [10, 20, 30], P75: idx = 0.75 * 2 = 1.5, interpolate between 20 and 30
      // result = 20 * 0.5 + 30 * 0.5 = 25
      expect(computePercentile([10, 20, 30], 75)).toBe(25);
    });

    it('handles large arrays', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1); // [1..100]
      const median = computePercentile(values, 50);
      expect(median).toBeCloseTo(50.5);
    });
  });

  describe('benchmark gap detection - higher_is_better metrics', () => {
    it('identifies underperformance when percentile <= 25 for higher_is_better', () => {
      expect(isUnderperforming(10, true)).toBe(true);
      expect(isUnderperforming(25, true)).toBe(true);
    });

    it('does not flag underperformance above 25th percentile for higher_is_better', () => {
      expect(isUnderperforming(26, true)).toBe(false);
      expect(isUnderperforming(50, true)).toBe(false);
      expect(isUnderperforming(75, true)).toBe(false);
    });

    it('identifies outperformance when percentile >= 75 for higher_is_better', () => {
      expect(isOutperforming(75, true)).toBe(true);
      expect(isOutperforming(90, true)).toBe(true);
      expect(isOutperforming(100, true)).toBe(true);
    });

    it('does not flag outperformance below 75th percentile for higher_is_better', () => {
      expect(isOutperforming(50, true)).toBe(false);
      expect(isOutperforming(74, true)).toBe(false);
    });
  });

  describe('benchmark gap detection - lower_is_better metrics', () => {
    it('inverts underperformance: percentile >= 75 for lower_is_better', () => {
      // For CPC or bounce_rate, high percentile means high cost = bad
      expect(isUnderperforming(75, false)).toBe(true);
      expect(isUnderperforming(90, false)).toBe(true);
    });

    it('does not flag underperformance below 75th percentile for lower_is_better', () => {
      expect(isUnderperforming(50, false)).toBe(false);
      expect(isUnderperforming(25, false)).toBe(false);
    });

    it('inverts outperformance: percentile <= 25 for lower_is_better', () => {
      // Low CPC = good, so low percentile = outperforming
      expect(isOutperforming(25, false)).toBe(true);
      expect(isOutperforming(10, false)).toBe(true);
    });

    it('does not flag outperformance above 25th percentile for lower_is_better', () => {
      expect(isOutperforming(50, false)).toBe(false);
      expect(isOutperforming(75, false)).toBe(false);
    });
  });

  describe('percentile rank computation', () => {
    it('computes percentile rank from position in sorted list', () => {
      // rank=0 out of 4 brands -> (0+1)/4 * 100 = 25
      expect(computePercentileRank(0, 4)).toBe(25);
    });

    it('top ranked is 100th percentile', () => {
      // rank=3 out of 4 -> (3+1)/4 * 100 = 100
      expect(computePercentileRank(3, 4)).toBe(100);
    });

    it('middle rank gives 50th percentile', () => {
      // rank=0 out of 2 -> (0+1)/2 * 100 = 50
      expect(computePercentileRank(0, 2)).toBe(50);
    });

    it('rounds to nearest integer', () => {
      // rank=0 out of 3 -> (1/3)*100 = 33.33... -> 33
      expect(computePercentileRank(0, 3)).toBe(33);
    });
  });
});
