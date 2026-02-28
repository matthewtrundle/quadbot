/**
 * Trend Analysis Library
 * Provides statistical functions for detecting trends in time-series data.
 */

export type LinearRegressionResult = {
  slope: number;
  intercept: number;
  rSquared: number;
};

export type TrendResult = {
  direction: 'up' | 'down' | 'stable';
  strength: 'weak' | 'moderate' | 'strong';
  slope: number;
  rSquared: number;
  rateOfChange: number;
  projectedValue: number;
};

/**
 * Compute linear regression on a numeric series.
 * x-values are 0-indexed positions (days).
 */
export function linearRegression(values: number[]): LinearRegressionResult {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, rSquared: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
    sumY2 += values[i] * values[i];
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssTot += (values[i] - yMean) ** 2;
    ssRes += (values[i] - predicted) ** 2;
  }

  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

/**
 * Compute a simple moving average with the given window size.
 */
export function movingAverage(values: number[], windowSize: number): number[] {
  if (windowSize < 1 || values.length === 0) return [];
  const result: number[] = [];
  for (let i = 0; i <= values.length - windowSize; i++) {
    const window = values.slice(i, i + windowSize);
    result.push(window.reduce((s, v) => s + v, 0) / windowSize);
  }
  return result;
}

/**
 * Calculate the rate of change between the first and last values in a series
 * as a percentage of the initial value.
 */
export function rateOfChange(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return last === 0 ? 0 : 100;
  return ((last - first) / Math.abs(first)) * 100;
}

/**
 * Detect a trend from a numeric time series.
 * Returns trend direction, strength, and projected next value.
 */
export function detectTrend(values: number[]): TrendResult {
  if (values.length < 3) {
    return {
      direction: 'stable',
      strength: 'weak',
      slope: 0,
      rSquared: 0,
      rateOfChange: 0,
      projectedValue: values[values.length - 1] || 0,
    };
  }

  const regression = linearRegression(values);
  const roc = rateOfChange(values);

  // Determine direction
  let direction: 'up' | 'down' | 'stable';
  if (regression.rSquared < 0.3) {
    direction = 'stable'; // Low correlation = no clear trend
  } else if (regression.slope > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  // Determine strength based on R-squared
  let strength: 'weak' | 'moderate' | 'strong';
  if (regression.rSquared >= 0.7) {
    strength = 'strong';
  } else if (regression.rSquared >= 0.4) {
    strength = 'moderate';
  } else {
    strength = 'weak';
  }

  // Project next value
  const projectedValue = regression.slope * values.length + regression.intercept;

  return {
    direction,
    strength,
    slope: Math.round(regression.slope * 1000) / 1000,
    rSquared: Math.round(regression.rSquared * 1000) / 1000,
    rateOfChange: Math.round(roc * 10) / 10,
    projectedValue: Math.round(projectedValue * 100) / 100,
  };
}
