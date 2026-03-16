import { describe, it, expect } from 'vitest';
import { brandCreateSchema, brandUpdateSchema, brandGuardrailsSchema } from '@quadbot/shared';

/**
 * Tests for brand Zod schemas: create, update, and guardrails.
 * Validates field requirements, defaults, and type constraints.
 */

describe('Brand Validation Schemas', () => {
  describe('brandCreateSchema', () => {
    it('accepts valid brand creation data with all fields', () => {
      const result = brandCreateSchema.safeParse({
        name: 'My Brand',
        mode: 'observe',
        modules_enabled: ['seo', 'ads'],
        guardrails: { max_risk: 'low' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('My Brand');
        expect(result.data.mode).toBe('observe');
        expect(result.data.modules_enabled).toEqual(['seo', 'ads']);
        expect(result.data.guardrails).toEqual({ max_risk: 'low' });
      }
    });

    it('applies defaults when optional fields are omitted', () => {
      const result = brandCreateSchema.safeParse({ name: 'Minimal Brand' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('observe');
        expect(result.data.modules_enabled).toEqual([]);
        expect(result.data.guardrails).toEqual({});
      }
    });

    it('rejects missing name', () => {
      const result = brandCreateSchema.safeParse({
        mode: 'observe',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const flat = result.error.flatten();
        expect(flat.fieldErrors.name).toBeDefined();
      }
    });

    it('rejects empty string name', () => {
      const result = brandCreateSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects name exceeding 255 characters', () => {
      const result = brandCreateSchema.safeParse({ name: 'x'.repeat(256) });
      expect(result.success).toBe(false);
    });

    it('accepts auto mode', () => {
      const result = brandCreateSchema.safeParse({
        name: 'Test Brand',
        mode: 'auto',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('auto');
      }
    });

    it('rejects invalid mode value', () => {
      const result = brandCreateSchema.safeParse({
        name: 'Test Brand',
        mode: 'turbo',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const flat = result.error.flatten();
        expect(flat.fieldErrors.mode).toBeDefined();
      }
    });

    it('rejects non-string mode values', () => {
      expect(brandCreateSchema.safeParse({ name: 'Test', mode: 123 }).success).toBe(false);
      expect(brandCreateSchema.safeParse({ name: 'Test', mode: true }).success).toBe(false);
    });

    it('accepts modules_enabled as a string array', () => {
      const result = brandCreateSchema.safeParse({
        name: 'Test',
        modules_enabled: ['content', 'outreach', 'analytics'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modules_enabled).toHaveLength(3);
      }
    });

    it('rejects modules_enabled with non-string items', () => {
      const result = brandCreateSchema.safeParse({
        name: 'Test',
        modules_enabled: [1, 2, 3],
      });
      expect(result.success).toBe(false);
    });

    it('accepts guardrails as a record of unknown values', () => {
      const result = brandCreateSchema.safeParse({
        name: 'Test',
        guardrails: {
          max_risk: 'low',
          nested: { deep: true },
          list: [1, 2, 3],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('brandUpdateSchema', () => {
    it('accepts valid full update', () => {
      const result = brandUpdateSchema.safeParse({
        name: 'Updated Name',
        mode: 'assist',
        modules_enabled: ['seo'],
        guardrails: { max_risk: 'high' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts partial update with only name', () => {
      const result = brandUpdateSchema.safeParse({ name: 'New Name' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('New Name');
        expect(result.data.mode).toBeUndefined();
      }
    });

    it('accepts partial update with only mode', () => {
      const result = brandUpdateSchema.safeParse({ mode: 'assist' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('assist');
        expect(result.data.name).toBeUndefined();
      }
    });

    it('accepts empty object as valid partial update', () => {
      const result = brandUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('strips unknown fields from update', () => {
      const result = brandUpdateSchema.safeParse({
        name: 'Test',
        unknownField: 'should be stripped',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).unknownField).toBeUndefined();
      }
    });

    it('rejects invalid mode in update', () => {
      const result = brandUpdateSchema.safeParse({ mode: 'turbo' });
      expect(result.success).toBe(false);
    });
  });

  describe('brandGuardrailsSchema', () => {
    it('accepts full guardrails configuration', () => {
      const result = brandGuardrailsSchema.safeParse({
        industry: 'Technology',
        description: 'A tech company',
        target_audience: 'Developers',
        keywords: ['typescript', 'react'],
        competitors: ['Company A'],
        content_policies: ['No spam'],
      });
      expect(result.success).toBe(true);
    });

    it('applies defaults for omitted fields', () => {
      const result = brandGuardrailsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.keywords).toEqual([]);
        expect(result.data.competitors).toEqual([]);
        expect(result.data.content_policies).toEqual([
          'No tragedy/disaster exploitation',
          'No crime/violence references',
        ]);
      }
    });

    it('overrides default content policies when provided', () => {
      const result = brandGuardrailsSchema.safeParse({
        content_policies: ['Custom policy'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content_policies).toEqual(['Custom policy']);
      }
    });
  });
});
