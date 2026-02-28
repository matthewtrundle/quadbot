import { describe, it, expect } from 'vitest';
import { linearRegression, movingAverage, rateOfChange, detectTrend } from '../trend-analysis.js';

describe('Trend Analysis', () => {
  describe('linearRegression', () => {
    it('computes perfect positive slope', () => {
      const result = linearRegression([1, 2, 3, 4, 5]);
      expect(result.slope).toBeCloseTo(1, 5);
      expect(result.intercept).toBeCloseTo(1, 5);
      expect(result.rSquared).toBeCloseTo(1, 5);
    });

    it('computes perfect negative slope', () => {
      const result = linearRegression([5, 4, 3, 2, 1]);
      expect(result.slope).toBeCloseTo(-1, 5);
      expect(result.rSquared).toBeCloseTo(1, 5);
    });

    it('returns zero slope for constant values', () => {
      const result = linearRegression([5, 5, 5, 5, 5]);
      expect(result.slope).toBe(0);
      expect(result.rSquared).toBe(0);
    });

    it('handles single value', () => {
      const result = linearRegression([42]);
      expect(result.slope).toBe(0);
      expect(result.intercept).toBe(42);
    });

    it('handles empty array', () => {
      const result = linearRegression([]);
      expect(result.slope).toBe(0);
    });

    it('computes realistic noisy data', () => {
      // Upward trend with noise
      const result = linearRegression([10, 12, 11, 14, 13, 16, 15, 18]);
      expect(result.slope).toBeGreaterThan(0);
      expect(result.rSquared).toBeGreaterThan(0.8);
    });
  });

  describe('movingAverage', () => {
    it('computes 3-day moving average', () => {
      const result = movingAverage([1, 2, 3, 4, 5], 3);
      expect(result).toEqual([2, 3, 4]);
    });

    it('returns empty for window larger than data', () => {
      const result = movingAverage([1, 2], 5);
      expect(result).toEqual([]);
    });

    it('returns all values for window of 1', () => {
      const result = movingAverage([1, 2, 3], 1);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('rateOfChange', () => {
    it('calculates positive rate of change', () => {
      expect(rateOfChange([100, 120])).toBe(20);
    });

    it('calculates negative rate of change', () => {
      expect(rateOfChange([100, 80])).toBe(-20);
    });

    it('returns 0 for single value', () => {
      expect(rateOfChange([100])).toBe(0);
    });

    it('handles zero starting value', () => {
      expect(rateOfChange([0, 100])).toBe(100);
    });

    it('handles zero to zero', () => {
      expect(rateOfChange([0, 0])).toBe(0);
    });
  });

  describe('detectTrend', () => {
    it('detects strong upward trend', () => {
      const result = detectTrend([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(result.direction).toBe('up');
      expect(result.strength).toBe('strong');
      expect(result.rSquared).toBeCloseTo(1, 2);
    });

    it('detects strong downward trend', () => {
      const result = detectTrend([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
      expect(result.direction).toBe('down');
      expect(result.strength).toBe('strong');
    });

    it('detects stable when values are constant', () => {
      const result = detectTrend([5, 5, 5, 5, 5]);
      expect(result.direction).toBe('stable');
    });

    it('detects stable for noisy data with no trend', () => {
      const result = detectTrend([10, 12, 8, 11, 9, 13, 7, 12, 10, 11]);
      expect(result.direction).toBe('stable');
      expect(result.strength).toBe('weak');
    });

    it('projects next value for upward trend', () => {
      const result = detectTrend([10, 20, 30, 40, 50]);
      expect(result.projectedValue).toBeGreaterThan(50);
    });

    it('returns stable for insufficient data', () => {
      const result = detectTrend([1, 2]);
      expect(result.direction).toBe('stable');
    });

    it('handles accelerating decline scenario', () => {
      // Clear declining trend
      const result = detectTrend([100, 95, 88, 80, 71, 60, 48, 35]);
      expect(result.direction).toBe('down');
      expect(result.rSquared).toBeGreaterThan(0.6);
      expect(result.rateOfChange).toBeLessThan(-50);
    });
  });
});
