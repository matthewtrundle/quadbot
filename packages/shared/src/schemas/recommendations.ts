import { z } from 'zod';

export const modelMetaSchema = z.object({
  prompt_version_id: z.string().uuid(),
  model: z.string(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
});

export const recommendationSchema = z.object({
  brand_id: z.string().uuid(),
  job_id: z.string().uuid(),
  source: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()).default({}),
  model_meta: modelMetaSchema,
});

export type ModelMeta = z.infer<typeof modelMetaSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
