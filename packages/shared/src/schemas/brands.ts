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

export type BrandCreate = z.infer<typeof brandCreateSchema>;
export type BrandUpdate = z.infer<typeof brandUpdateSchema>;
