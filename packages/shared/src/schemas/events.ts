import { z } from 'zod';

export const eventCreateSchema = z.object({
  brand_id: z.string().uuid(),
  type: z.string().min(1).max(100),
  payload: z.record(z.unknown()).default({}),
  source: z.string().max(100).optional(),
  dedupe_key: z.string().optional(),
});

export type EventCreate = z.infer<typeof eventCreateSchema>;

export const eventRuleCreateSchema = z.object({
  brand_id: z.string().uuid().optional(),
  event_type: z.string().min(1).max(100),
  job_type: z.string().min(1).max(100),
  conditions: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

export type EventRuleCreate = z.infer<typeof eventRuleCreateSchema>;
