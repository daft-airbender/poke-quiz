import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { GENERATIONS } from '../quiz/pokemon.js';
import { badRequest } from './errors.js';

export const ROUND_LENGTHS = [10, 20, 30];

// The one place settings defaults live. Stored settings are merged over these,
// so adding a setting is: a default here, a validator below, and a control on the settings screen.
export const DEFAULT_SETTINGS = {
  roundLength: 10,
  gens: [], // [] = all generations
  autoAdvance: false,
};

// One check per known key.
const VALIDATORS = {
  roundLength: (value) => ROUND_LENGTHS.includes(value),
  gens: (value) => Array.isArray(value) && value.every((gen) => GENERATIONS.includes(gen)) && new Set(value).size === value.length,
  autoAdvance: (value) => typeof value === 'boolean',
};

// Stored settings over the defaults, dropping unknown keys and values that are no longer valid.
export function withDefaults(stored = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, isValid] of Object.entries(VALIDATORS)) {
    if (key in stored && isValid(stored[key])) settings[key] = stored[key];
  }
  return settings;
}

// The known keys from a PUT body. Unknown keys are ignored; a known key with a bad value is a 400.
export function parseSettingsUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Settings must be a JSON object');
  const update = {};
  for (const [key, isValid] of Object.entries(VALIDATORS)) {
    if (!(key in body)) continue;
    if (!isValid(body[key])) throw badRequest(`Invalid value for ${key}`);
    update[key] = body[key];
  }
  if (update.gens) {
    update.gens = [...update.gens].sort((a, b) => a - b);
    // Every generation selected means "all".
    if (update.gens.length === GENERATIONS.length) update.gens = [];
  }
  return update;
}

export function settingsRouter() {
  const router = Router();

  router.get('/settings', async (req, res) => {
    const [user] = await getDb().select({ settings: users.settings }).from(users).where(eq(users.id, req.userId)).limit(1);
    res.json(withDefaults(user?.settings));
  });

  // Partial update: only the keys sent change. Returns the full settings.
  router.put('/settings', async (req, res) => {
    const update = parseSettingsUpdate(req.body);
    const [user] = await getDb()
      .update(users)
      .set({ settings: sql`${users.settings} || ${JSON.stringify(update)}::jsonb` })
      .where(eq(users.id, req.userId))
      .returning({ settings: users.settings });
    res.json(withDefaults(user?.settings));
  });

  return router;
}
