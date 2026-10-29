// Applies pending migrations from drizzle/ to the database.
//
//   npm run db:migrate
//
// Runs in Render's build command, so it only uses regular dependencies (drizzle-orm, pg),
// not drizzle-kit, which `npm ci` skips in production. Already-applied migrations are
// skipped, so it's safe to run on every deploy.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPool } from '../src/db/client.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Neon recommends the direct (non-pooled) connection for migrations.
const pool = createPool(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);

try {
  await migrate(drizzle(pool), { migrationsFolder: path.join(rootDir, 'drizzle') });
  console.log('Migrations applied.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
