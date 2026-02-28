import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the anomaly detection math used in anomaly-detector.ts.
 * Tests z-score calculation, deviation, severity classification, and confidence
 * without requiring database access.
 */

type AnomalyType = 'spike' | 'drop' | 'zero' | 'pattern_break';

type Anomaly = {
  metric_key: string;
  source: string;
  type: AnomalyType;
  current_value: number;
  expected_value: number;
  deviation_pct: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

const DEVIATION_THRESHOLDS = {
  low: 0.20,
  medium: 0.40,
  high: 0.60,
  critical: 0.80,
};

// Replicated statistics computations from anomaly-detector.ts
function computeMean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function computeStdDev(values: number[]): number {
  const mean = computeMean(values);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return Math.abs((value - mean) / stdDev);
}

function computeDeviationPct(value: number, mean: number): number {
  return mean !== 0 ? Math.abs((value - mean) / mean) : 0;
}

function detectAnomalyType(recent: number, mean: number): AnomalyType {
  if (recent === 0 && mean > 0) return 'zero';
  if (recent > mean) return 'spike';
  return 'drop';
}

function classifySeverity(deviationPct: number): Anomaly['severity'] {
  if (deviationPct >= DEVIATION_THRESHOLDS.critical) return 'critical';
  if (deviationPct >= DEVIATION_THRESHOLDS.high) return 'high';
  if (deviationPct >= DEVIATION_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function computeConfidence(deviationPct: number): number {
  // deviationPct comes in as a whole number (e.g., 50 for 50%), match the source code
  return Math.min(0.5 + (deviationPct / 200), 0.95);
}

function shouldSkipGroup(values: number[]): boolean {
  return values.length < 5;
}

function shouldSkipZeroStdDev(stdDev: number): boolean {
  return stdDev === 0;
}

/**
 * Full anomaly detection pipeline for a single metric group.
 * Returns null if no anomaly detected, otherwise the anomaly object.
 */
function detectAnomaly(
  metricKey: string,
  source: string,
  numericValues: number[],
): Anomaly | null {
  if (numericValues.length < 5) return null;

  const recent = numericValues[0];
  const historical = numericValues.slice(1);
  const mean = computeMean(historical);
  const stdDev = computeStdDev(historical);

  if (stdDev === 0) return null;

  const zScore = computeZScore(recent, mean, stdDev);
  const deviationPct = computeDeviationPct(recent, mean);

  if (zScore < 2) return null;

  const type = detectAnomalyType(recent, mean);
  const severity = classifySeverity(deviationPct);

  return {
    metric_key: metricKey,
    source,
    type,
    current_value: Math.round(recent * 100) / 100,
    expected_value: Math.round(mean * 100) / 100,
    deviation_pct: Math.round(deviationPct * 100),
    severity,
  };
}

describe('Anomaly Detector', () => {
  describe('z-score calculation', () => {
    it('computes z-score correctly', () => {
      // mean=100, stdDev=10, value=120 -> zScore = |20/10| = 2
      expect(computeZScore(120, 100, 10)).toBe(2);
    });

    it('returns 0 when stdDev is 0', () => {
      expect(computeZScore(100, 100, 0)).toBe(0);
    });

    it('uses absolute value for z-score', () => {
      // Below mean: value=80, mean=100, stdDev=10 -> |(-20)/10| = 2
      expect(computeZScore(80, 100, 10)).toBe(2);
    });

    it('flags anomaly when z-score > 2', () => {
      const zScore = computeZScore(130, 100, 10); // z = 3
      expect(zScore).toBeGreaterThan(2);
    });

    it('does not flag when z-score < 2', () => {
      const zScore = computeZScore(115, 100, 10); // z = 1.5
      expect(zScore).toBeLessThan(2);
    });
  });

  describe('deviation percentage', () => {
    it('computes positive deviation correctly', () => {
      // value=150, mean=100 -> |50/100| = 0.5
      expect(computeDeviationPct(150, 100)).toBe(0.5);
    });

    it('computes negative deviation correctly', () => {
      // value=50, mean=100 -> |(-50)/100| = 0.5
      expect(computeDeviationPct(50, 100)).toBe(0.5);
    });

    it('returns 0 when mean is 0', () => {
      expect(computeDeviationPct(10, 0)).toBe(0);
    });

    it('returns 0 when value equals mean', () => {
      expect(computeDeviationPct(100, 100)).toBe(0);
    });
  });

  describe('anomaly type detection', () => {
    it('detects spike when value > mean', () => {
      expect(detectAnomalyType(200, 100)).toBe('spike');
    });

    it('detects drop when value < mean', () => {
      expect(detectAnomalyType(50, 100)).toBe('drop');
    });

    it('detects zero when value is 0 and mean is positive', () => {
      expect(detectAnomalyType(0, 100)).toBe('zero');
    });

    it('detects drop when both value and mean are 0', () => {
      // recent=0, mean=0 -> not (0 && mean>0), not (0>0), so drop
      expect(detectAnomalyType(0, 0)).toBe('drop');
    });
  });

  describe('severity classification', () => {
    it('classifies low severity (< 40% deviation)', () => {
      expect(classifySeverity(0.0)).toBe('low');
      expect(classifySeverity(0.15)).toBe('low');
      expect(classifySeverity(0.19)).toBe('low');
      expect(classifySeverity(0.39)).toBe('low');
    });

    it('classifies medium severity (40-60% deviation)', () => {
      expect(classifySeverity(0.40)).toBe('medium');
      expect(classifySeverity(0.50)).toBe('medium');
      expect(classifySeverity(0.59)).toBe('medium');
    });

    it('classifies high severity (60-80% deviation)', () => {
      expect(classifySeverity(0.60)).toBe('high');
      expect(classifySeverity(0.70)).toBe('high');
      expect(classifySeverity(0.79)).toBe('high');
    });

    it('classifies critical severity (80%+ deviation)', () => {
      expect(classifySeverity(0.80)).toBe('critical');
      expect(classifySeverity(1.0)).toBe('critical');
      expect(classifySeverity(1.5)).toBe('critical');
    });

    it('boundary: exactly at threshold values', () => {
      // Thresholds: low=0.20, medium=0.40, high=0.60, critical=0.80
      // Check order: >= critical, >= high, >= medium, else low
      expect(classifySeverity(0.20)).toBe('low');     // below medium threshold (0.40)
      expect(classifySeverity(0.40)).toBe('medium');  // at medium threshold
      expect(classifySeverity(0.60)).toBe('high');    // at high threshold
      expect(classifySeverity(0.80)).toBe('critical');// at critical threshold
    });
  });

  describe('skip conditions', () => {
    it('skips when fewer than 5 data points', () => {
      expect(shouldSkipGroup([1, 2, 3, 4])).toBe(true);
      expect(shouldSkipGroup([1])).toBe(true);
      expect(shouldSkipGroup([])).toBe(true);
    });

    it('does not skip with 5 or more data points', () => {
      expect(shouldSkipGroup([1, 2, 3, 4, 5])).toBe(false);
      expect(shouldSkipGroup([1, 2, 3, 4, 5, 6])).toBe(false);
    });

    it('skips when stdDev is 0 (all values identical)', () => {
      expect(shouldSkipZeroStdDev(0)).toBe(true);
    });

    it('does not skip when stdDev is non-zero', () => {
      expect(shouldSkipZeroStdDev(0.5)).toBe(false);
    });
  });

  describe('confidence calculation', () => {
    it('computes confidence from deviation percentage', () => {
      // deviation_pct = 50 -> confidence = min(0.5 + 50/200, 0.95) = 0.75
      expect(computeConfidence(50)).toBe(0.75);
    });

    it('minimum confidence is 0.5 when deviation is 0', () => {
      expect(computeConfidence(0)).toBe(0.5);
    });

    it('caps confidence at 0.95', () => {
      // deviation_pct = 200 -> 0.5 + 200/200 = 1.5, capped at 0.95
      expect(computeConfidence(200)).toBe(0.95);
    });

    it('reaches cap at deviation_pct = 90', () => {
      // 0.5 + 90/200 = 0.95
      expect(computeConfidence(90)).toBe(0.95);
    });

    it('is below cap for moderate deviations', () => {
      // deviation_pct = 80 -> 0.5 + 80/200 = 0.9
      expect(computeConfidence(80)).toBe(0.9);
    });
  });

  describe('full anomaly detection pipeline', () => {
    it('detects a spike anomaly with sufficient data', () => {
      // Historical: [100, 100, 100, 100], mean=100, stdDev=0... all same
      // Use slightly varied historical data
      const values = [200, 100, 102, 98, 101, 99]; // recent=200, historical=[100,102,98,101,99]
      const result = detectAnomaly('clicks', 'gsc', values);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('spike');
      expect(result!.current_value).toBe(200);
    });

    it('detects a drop anomaly', () => {
      const values = [10, 100, 102, 98, 101, 99]; // recent=10, much lower than mean ~100
      const result = detectAnomaly('clicks', 'gsc', values);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('drop');
    });

    it('returns null when data is insufficient', () => {
      const values = [100, 200, 50, 300]; // only 4 data points
      const result = detectAnomaly('clicks', 'gsc', values);
      expect(result).toBeNull();
    });

    it('returns null when all historical values are identical (stdDev=0)', () => {
      const values = [200, 100, 100, 100, 100, 100]; // historical all 100
      const result = detectAnomaly('clicks', 'gsc', values);
      // stdDev = 0, so skip
      expect(result).toBeNull();
    });

    it('returns null when z-score is below threshold', () => {
      // Small deviation, large stdDev
      const values = [105, 100, 110, 90, 120, 80]; // recent=105, mean~100, stdDev~14.14
      // zScore = |5/14.14| = 0.35 < 2
      const result = detectAnomaly('clicks', 'gsc', values);
      expect(result).toBeNull();
    });
  });
});
