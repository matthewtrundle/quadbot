import { z } from 'zod';

export const queuePayloadSchema = z.object({
  jobId: z.string().uuid(),
  type: z.string(),
  payload: z.record(z.unknown()),
});

export const jobCreateSchema = z.object({
  brand_id: z.string().uuid(),
  type: z.string(),
  payload: z.record(z.unknown()).default({}),
});

export type QueuePayload = z.infer<typeof queuePayloadSchema>;
export type JobCreate = z.infer<typeof jobCreateSchema>;
