import { z } from 'zod';

export const communityModerationOutputSchema = z.object({
  decision: z.enum(['approve', 'reject', 'escalate', 'flag']),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  needs_human_review: z.boolean(),
  tags: z.array(z.string()),
});

export const gscChangeSchema = z.object({
  query: z.string(),
  clicks_delta: z.number(),
  impressions_delta: z.number(),
  ctr_delta: z.number(),
  position_delta: z.number(),
});

export const gscRecommendationSchema = z.object({
  type: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  description: z.string(),
});

export const gscDigestOutputSchema = z.object({
  summary: z.string(),
  top_changes: z.array(gscChangeSchema),
  recommendations: z.array(gscRecommendationSchema),
});

export const actionDraftGeneratorOutputSchema = z.object({
  type: z.string(),
  payload: z.record(z.unknown()),
  risk: z.enum(['low', 'medium', 'high']),
  guardrails_applied: z.record(z.unknown()),
  requires_approval: z.boolean(),
});

export const strategicPrioritizerOutputSchema = z.object({
  adjustments: z.array(z.object({
    recommendation_id: z.string(),
    delta_rank: z.number().min(-2).max(2),
    effort_estimate: z.enum(['minutes', 'hours', 'days']),
    reasoning: z.string(),
  })),
});

export type StrategicPrioritizerOutput = z.infer<typeof strategicPrioritizerOutputSchema>;
export type CommunityModerationOutput = z.infer<typeof communityModerationOutputSchema>;
export type GscDigestOutput = z.infer<typeof gscDigestOutputSchema>;
export type ActionDraftGeneratorOutput = z.infer<typeof actionDraftGeneratorOutputSchema>;
