import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const sql = postgres(connectionString);
  const migrationsDir = join(__dirname, '..', 'migrations');

  console.log('Running migrations...');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    console.log(`  Running ${file}...`);
    const migration = readFileSync(join(migrationsDir, file), 'utf-8');
    await sql.unsafe(migration);
    console.log(`  ${file} complete.`);
  }

  console.log('All migrations complete.');
  await sql.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
