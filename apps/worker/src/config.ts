import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  ENCRYPTION_KEY: z.string().min(64),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WORKER_PORT: z.coerce.number().default(4000),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
