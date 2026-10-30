// Applies pending migrations from drizzle/ to the database, then syncs the SRS card catalog
// (the cards table) with the mode registry.
//
//   npm run db:migrate
//
// Runs in Render's build command, so it only uses regular dependencies (drizzle-orm, pg),
// not drizzle-kit, which `npm ci` skips in production. Already-applied migrations are
// skipped and unchanged cards aren't rewritten, so it's safe to run on every deploy.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { syncCards } from '../src/db/cards.js';
import { createPool } from '../src/db/client.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Neon recommends the direct (non-pooled) connection for migrations.
const pool = createPool(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);

try {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: path.join(rootDir, 'drizzle') });
  console.log('Migrations applied.');
  const { total, changed, inactive } = await syncCards(db);
  console.log(`Card catalog synced: ${total} cards, ${changed} new or changed${inactive ? `, ${inactive} marked inactive` : ''}.`);
} catch (err) {
  console.error('Migration or card sync failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
