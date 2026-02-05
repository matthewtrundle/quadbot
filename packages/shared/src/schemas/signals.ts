import { z } from 'zod';

export const signalExtractorOutputSchema = z.object({
  signal_type: z.enum(['pattern', 'anti-pattern', 'threshold', 'correlation']),
  domain: z.string(),
  title: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  evidence: z.record(z.unknown()),
  ttl_days: z.number().min(1).max(365).default(90),
});

export type SignalExtractorOutput = z.infer<typeof signalExtractorOutputSchema>;
