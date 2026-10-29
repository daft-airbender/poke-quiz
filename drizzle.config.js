import { defineConfig } from 'drizzle-kit';

// Used by drizzle-kit (dev only) to generate SQL migrations from src/db/schema.js.
// Migrations are applied by scripts/migrate.js, not drizzle-kit.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
});
