import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@quadbot/db';

function createDb() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL!;
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

// Lazy-init to avoid errors during Next.js build (no DB at build time)
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Convenience alias for import compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Proxy forwarding requires dynamic property access
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop: string | symbol) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
