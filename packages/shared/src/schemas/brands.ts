import { z } from 'zod';

export const brandCreateSchema = z.object({
  name: z.string().min(1).max(255),
  mode: z.enum(['observe', 'assist']).default('observe'),
  modules_enabled: z.array(z.string()).default([]),
  guardrails: z.record(z.unknown()).default({}),
});

export const brandUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  mode: z.enum(['observe', 'assist']).optional(),
  modules_enabled: z.array(z.string()).optional(),
  guardrails: z.record(z.unknown()).optional(),
});

// Brand Profile / Guardrails schema (stored in brands.guardrails jsonb column)
export const brandGuardrailsSchema = z.object({
  industry: z.string().optional(),
  description: z.string().optional(),
  target_audience: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  competitors: z.array(z.string()).default([]),
  content_policies: z.array(z.string()).default([
    'No tragedy/disaster exploitation',
    'No crime/violence references',
  ]),
});

export type BrandGuardrails = z.infer<typeof brandGuardrailsSchema>;

export type BrandCreate = z.infer<typeof brandCreateSchema>;
export type BrandUpdate = z.infer<typeof brandUpdateSchema>;
