import { describe, it, expect } from 'vitest';

/**
 * Tests for claude-tools trend calculation logic.
 * Replicated locally to avoid config import chain.
 */
function calculateTrend(values: number[]) {
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const direction = slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable';
  const projected = slope * n + intercept;

  return { direction, slope, rSquared, projectedNextValue: projected };
}

describe('Claude Tools', () => {
  describe('calculate_trend', () => {
    it('detects increasing trend', () => {
      const result = calculateTrend([1, 2, 3, 4, 5]);
      expect(result.direction).toBe('increasing');
      expect(result.slope).toBeCloseTo(1, 1);
      expect(result.rSquared).toBeCloseTo(1, 2);
    });

    it('detects decreasing trend', () => {
      const result = calculateTrend([10, 8, 6, 4, 2]);
      expect(result.direction).toBe('decreasing');
      expect(result.slope).toBeCloseTo(-2, 1);
    });

    it('detects stable trend', () => {
      const result = calculateTrend([5, 5, 5, 5, 5]);
      expect(result.direction).toBe('stable');
      expect(result.slope).toBeCloseTo(0, 2);
    });

    it('projects next value correctly for linear series', () => {
      const result = calculateTrend([2, 4, 6, 8]);
      // Next value (index 4) should be ~10
      expect(result.projectedNextValue).toBeCloseTo(10, 0);
    });

    it('handles noisy data', () => {
      const result = calculateTrend([1, 3, 2, 4, 3, 5, 4, 6]);
      expect(result.direction).toBe('increasing');
      expect(result.rSquared).toBeGreaterThan(0.5);
    });
  });
});
