import { z } from 'zod';

export const guardrailsSchema = z.object({
  max_risk: z.enum(['low', 'medium', 'high']).default('medium'),
  requires_approval: z.boolean().default(true),
  allowed_action_types: z.array(z.string()).default([]),
});

export const actionDraftSchema = z.object({
  brand_id: z.string().uuid(),
  recommendation_id: z.string().uuid(),
  type: z.string(),
  payload: z.record(z.unknown()),
  risk: z.enum(['low', 'medium', 'high']),
  guardrails_applied: guardrailsSchema,
  requires_approval: z.boolean(),
  status: z.enum(['pending', 'approved', 'rejected', 'executed_stub', 'executed']).default('pending'),
});

export type Guardrails = z.infer<typeof guardrailsSchema>;
export type ActionDraft = z.infer<typeof actionDraftSchema>;
