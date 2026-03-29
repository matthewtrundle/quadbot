import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  ENCRYPTION_KEY: z.string().min(64),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WORKER_PORT: z.coerce.number().default(4000),
  // Phase 2: Embedding APIs (optional)
  VOYAGE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  // Phase 2: OpenTelemetry (optional)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  // Phase 2: GrowthBook (optional)
  GROWTHBOOK_API_HOST: z.string().optional(),
  GROWTHBOOK_CLIENT_KEY: z.string().optional(),
  // Image generation via OpenRouter (optional)
  OPENROUTER_API_KEY: z.string().optional(),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
