import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Tests for the recommendation status update logic.
 * Tests zod validation and dismissed_at logic.
 */

const statusSchema = z.object({
  status: z.enum(['active', 'dismissed', 'bookmarked']),
});

function computeDismissedAt(status: string): Date | null {
  return status === 'dismissed' ? new Date() : null;
}

describe('Recommendation Status', () => {
  describe('zod validation', () => {
    it('accepts valid statuses', () => {
      expect(statusSchema.safeParse({ status: 'active' }).success).toBe(true);
      expect(statusSchema.safeParse({ status: 'dismissed' }).success).toBe(true);
      expect(statusSchema.safeParse({ status: 'bookmarked' }).success).toBe(true);
    });

    it('rejects invalid statuses', () => {
      expect(statusSchema.safeParse({ status: 'deleted' }).success).toBe(false);
      expect(statusSchema.safeParse({ status: '' }).success).toBe(false);
      expect(statusSchema.safeParse({ status: 'ACTIVE' }).success).toBe(false);
      expect(statusSchema.safeParse({}).success).toBe(false);
    });

    it('rejects non-object input', () => {
      expect(statusSchema.safeParse('active').success).toBe(false);
      expect(statusSchema.safeParse(null).success).toBe(false);
      expect(statusSchema.safeParse(undefined).success).toBe(false);
    });

    it('extracts status from valid input', () => {
      const result = statusSchema.safeParse({ status: 'dismissed' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('dismissed');
      }
    });

    it('provides error details for invalid input', () => {
      const result = statusSchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const flat = result.error.flatten();
        expect(flat.fieldErrors.status).toBeDefined();
        expect(flat.fieldErrors.status!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('dismissed_at logic', () => {
    it('sets dismissed_at when status is dismissed', () => {
      const result = computeDismissedAt('dismissed');
      expect(result).toBeInstanceOf(Date);
    });

    it('sets dismissed_at to null when status is active (restored)', () => {
      const result = computeDismissedAt('active');
      expect(result).toBeNull();
    });

    it('sets dismissed_at to null when status is bookmarked', () => {
      const result = computeDismissedAt('bookmarked');
      expect(result).toBeNull();
    });
  });
});
