import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { recommendationSchema } from '@quadbot/shared';

/**
 * Comprehensive tests for recommendation status validation
 * and the full recommendation creation schema.
 * Extends the existing status.test.ts with deeper coverage.
 */

const statusSchema = z.object({
  status: z.enum(['active', 'dismissed', 'bookmarked']),
});

describe('Recommendation Status Schema', () => {
  describe('valid status values', () => {
    it('accepts "active" status', () => {
      const result = statusSchema.safeParse({ status: 'active' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('active');
      }
    });

    it('accepts "dismissed" status', () => {
      const result = statusSchema.safeParse({ status: 'dismissed' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('dismissed');
      }
    });

    it('accepts "bookmarked" status', () => {
      const result = statusSchema.safeParse({ status: 'bookmarked' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('bookmarked');
      }
    });
  });

  describe('invalid status values', () => {
    it('rejects empty string', () => {
      const result = statusSchema.safeParse({ status: '' });
      expect(result.success).toBe(false);
    });

    it('rejects null status value', () => {
      const result = statusSchema.safeParse({ status: null });
      expect(result.success).toBe(false);
    });

    it('rejects undefined status (missing field)', () => {
      const result = statusSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const flat = result.error.flatten();
        expect(flat.fieldErrors.status).toBeDefined();
      }
    });

    it('rejects number values for status', () => {
      const result = statusSchema.safeParse({ status: 42 });
      expect(result.success).toBe(false);
    });

    it('rejects boolean values for status', () => {
      const result = statusSchema.safeParse({ status: true });
      expect(result.success).toBe(false);
    });

    it('rejects case-sensitive variants', () => {
      expect(statusSchema.safeParse({ status: 'Active' }).success).toBe(false);
      expect(statusSchema.safeParse({ status: 'DISMISSED' }).success).toBe(false);
      expect(statusSchema.safeParse({ status: 'Bookmarked' }).success).toBe(false);
    });
  });

  describe('schema stripping behavior', () => {
    it('strips additional fields beyond status', () => {
      const result = statusSchema.safeParse({
        status: 'active',
        extra: 'should-not-appear',
        nested: { foo: 'bar' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ status: 'active' });
        expect((result.data as Record<string, unknown>).extra).toBeUndefined();
      }
    });
  });
});

describe('Recommendation Creation Schema', () => {
  const validRecommendation = {
    brand_id: '550e8400-e29b-41d4-a716-446655440000',
    job_id: '550e8400-e29b-41d4-a716-446655440001',
    source: 'gsc_daily_digest',
    priority: 'high' as const,
    title: 'Optimize meta descriptions',
    body: 'Several pages have missing or short meta descriptions.',
    data: { pages_affected: 5 },
    model_meta: {
      prompt_version_id: '550e8400-e29b-41d4-a716-446655440002',
      model: 'claude-sonnet-4-20250514',
      input_tokens: 1500,
      output_tokens: 800,
    },
  };

  it('accepts a fully valid recommendation', () => {
    const result = recommendationSchema.safeParse(validRecommendation);
    expect(result.success).toBe(true);
  });

  it('accepts all valid priority levels', () => {
    for (const priority of ['low', 'medium', 'high', 'critical'] as const) {
      const result = recommendationSchema.safeParse({
        ...validRecommendation,
        priority,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid priority levels', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      priority: 'urgent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID brand_id', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      brand_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = recommendationSchema.safeParse({
      brand_id: validRecommendation.brand_id,
    });
    expect(result.success).toBe(false);
  });

  it('defaults data to empty object when omitted', () => {
    const { data: _data, ...withoutData } = validRecommendation;
    const result = recommendationSchema.safeParse(withoutData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toEqual({});
    }
  });

  it('validates model_meta requires all fields', () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      model_meta: {
        model: 'claude-sonnet-4-20250514',
        // missing prompt_version_id, input_tokens, output_tokens
      },
    });
    expect(result.success).toBe(false);
  });
});
