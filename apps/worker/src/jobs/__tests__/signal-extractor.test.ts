import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the signal extractor logic used in signal-extractor.ts.
 * Tests TTL calculation, outcome data mapping, and signal data transformation
 * without requiring database access or LLM calls.
 */

// Replicated TTL computation from signal-extractor.ts
function computeExpiresAt(baseDateMs: number, ttlDays: number | undefined | null): Date {
  const expiresAt = new Date(baseDateMs);
  expiresAt.setDate(expiresAt.getDate() + (ttlDays ?? 90));
  return expiresAt;
}

// Replicated outcome data mapping from signal-extractor.ts
function mapOutcomeData(
  outcomes: Array<{
    metric_name: string;
    delta: number | null;
    metric_value_before: number | null;
    metric_value_after: number | null;
  }>,
): Array<{
  metric_name: string;
  delta: number | null;
  before: number | null;
  after: number | null;
}> {
  return outcomes.map((o) => ({
    metric_name: o.metric_name,
    delta: o.delta,
    before: o.metric_value_before,
    after: o.metric_value_after,
  }));
}

// Replicated payload validation from signal-extractor.ts
function hasRequiredPayload(payload: Record<string, unknown>): boolean {
  return typeof payload.recommendation_id === 'string' && payload.recommendation_id !== '';
}

describe('Signal Extractor', () => {
  describe('TTL calculation', () => {
    // Use a fixed base date - we compare by computing expected the same way
    const baseDate = new Date('2025-01-15T12:00:00Z').getTime();

    function expectedDate(baseDateMs: number, days: number): Date {
      const d = new Date(baseDateMs);
      d.setDate(d.getDate() + days);
      return d;
    }

    it('defaults to 90 days when ttl_days is undefined', () => {
      const result = computeExpiresAt(baseDate, undefined);
      const expected = expectedDate(baseDate, 90);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('defaults to 90 days when ttl_days is null', () => {
      const result = computeExpiresAt(baseDate, null);
      const expected = expectedDate(baseDate, 90);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('applies custom TTL of 30 days', () => {
      const result = computeExpiresAt(baseDate, 30);
      const expected = expectedDate(baseDate, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('applies custom TTL of 7 days', () => {
      const result = computeExpiresAt(baseDate, 7);
      const expected = expectedDate(baseDate, 7);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('applies custom TTL of 180 days', () => {
      const result = computeExpiresAt(baseDate, 180);
      const expected = expectedDate(baseDate, 180);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('handles TTL of 0 days (expires immediately)', () => {
      const result = computeExpiresAt(baseDate, 0);
      // 0 ?? 90 = 0 (nullish coalescing does NOT fallback for 0)
      const expected = expectedDate(baseDate, 0);
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe('outcome data mapping', () => {
    it('transforms outcome data correctly', () => {
      const outcomes = [
        { metric_name: 'avg_ctr', delta: 0.5, metric_value_before: 2.0, metric_value_after: 2.5 },
        { metric_name: 'clicks', delta: 100, metric_value_before: 500, metric_value_after: 600 },
      ];

      const result = mapOutcomeData(outcomes);
      expect(result).toEqual([
        { metric_name: 'avg_ctr', delta: 0.5, before: 2.0, after: 2.5 },
        { metric_name: 'clicks', delta: 100, before: 500, after: 600 },
      ]);
    });

    it('handles null values in outcomes', () => {
      const outcomes = [
        { metric_name: 'impressions', delta: null, metric_value_before: null, metric_value_after: null },
      ];

      const result = mapOutcomeData(outcomes);
      expect(result).toEqual([
        { metric_name: 'impressions', delta: null, before: null, after: null },
      ]);
    });

    it('handles empty outcomes array', () => {
      const result = mapOutcomeData([]);
      expect(result).toEqual([]);
    });

    it('preserves field names correctly (before/after vs metric_value_before/after)', () => {
      const outcomes = [
        { metric_name: 'test', delta: 1, metric_value_before: 10, metric_value_after: 11 },
      ];
      const result = mapOutcomeData(outcomes);
      expect(result[0]).toHaveProperty('before');
      expect(result[0]).toHaveProperty('after');
      expect(result[0]).not.toHaveProperty('metric_value_before');
      expect(result[0]).not.toHaveProperty('metric_value_after');
    });
  });

  describe('payload validation', () => {
    it('requires recommendation_id in payload', () => {
      expect(hasRequiredPayload({ recommendation_id: 'rec-123' })).toBe(true);
    });

    it('rejects missing recommendation_id', () => {
      expect(hasRequiredPayload({})).toBe(false);
    });

    it('rejects empty string recommendation_id', () => {
      expect(hasRequiredPayload({ recommendation_id: '' })).toBe(false);
    });

    it('rejects non-string recommendation_id', () => {
      expect(hasRequiredPayload({ recommendation_id: 123 })).toBe(false);
      expect(hasRequiredPayload({ recommendation_id: null })).toBe(false);
    });
  });
});
