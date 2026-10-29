import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

// Opens a pool for the given connection string. The app uses Neon's pooled string;
// scripts/migrate.js may pass the direct one.
export function createPool(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new pg.Pool({
    // Neon's strings say sslmode=require, which pg currently treats as verify-full but will
    // weaken in pg v9. Ask for verify-full explicitly to keep certificate checks (and silence
    // pg's warning about it).
    connectionString: connectionString.replace(/sslmode=(prefer|require|verify-ca)\b/, 'sslmode=verify-full'),
    // Neon offers SCRAM channel binding; pg ignores "channel_binding" in the URL, so opt in here.
    enableChannelBinding: true,
    // Neon can take a few seconds to wake from scale-to-zero.
    connectionTimeoutMillis: 30_000,
  });
}

// Created lazily so modules that import the db (and tests) don't need a database until they use it.
let db;

export function getDb() {
  if (!db) db = drizzle(createPool(process.env.DATABASE_URL), { schema });
  return db;
}
