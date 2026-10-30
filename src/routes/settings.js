import { eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { listModes } from '../quiz/modes/index.js';
import { GENERATIONS, POKEMON_BY_ID } from '../quiz/pokemon.js';
import { parseSessionLength } from '../srs/session.js';
import { badRequest } from './errors.js';

// The one place settings defaults live. Stored settings are merged over these,
// so adding a setting is: a default here, a validator below, and a control on the settings screen.
export const DEFAULT_SETTINGS = {
  theme: null, // a Pokédex number whose colors theme the app; null = the default red
  playScope: { modes: null, gens: null }, // "What to learn": which modes / generations new cards come from; null = all
  lastLength: { play: null, free_play: null }, // last session length used, per kind; null = the default
  newCardsExtra: { day: null, count: 0 }, // "Add 10 more" new cards: how many extra, for which New York day
  freePlayFilter: { modes: null, gens: null }, // the last Free Play filters used; null = all
};

const MODE_IDS = listModes().map((mode) => mode.id);
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
// null (= everything), or a non-empty list of distinct allowed values.
const isListOrNull = (value, allowed) =>
  value === null || (Array.isArray(value) && value.length > 0 && value.every((v) => allowed.includes(v)) && new Set(value).size === value.length);

// { modes, gens }: which modes and generations, each null (= all) or a list.
const isScope = (value) => isPlainObject(value) && isListOrNull(value.modes, MODE_IDS) && isListOrNull(value.gens, GENERATIONS);

// Sorted, and "every mode" / "every generation" stored as null (= all), so modes or generations added later
// are included automatically.
function normalizeScope({ modes, gens }) {
  const sortedModes = modes && MODE_IDS.filter((id) => modes.includes(id));
  const sortedGens = gens && [...gens].sort((a, b) => a - b);
  return {
    modes: sortedModes && sortedModes.length < MODE_IDS.length ? sortedModes : null,
    gens: sortedGens && sortedGens.length < GENERATIONS.length ? sortedGens : null,
  };
}

// A { modes, gens } filter from (untrusted) input, normalized, or null if invalid.
export function parseScope(value) {
  return isScope(value) ? normalizeScope(value) : null;
}

// One check per known key.
const VALIDATORS = {
  theme: (value) => value === null || (Number.isInteger(value) && POKEMON_BY_ID.has(value)),
  playScope: (value) => isScope(value),
  freePlayFilter: (value) => isScope(value),
  // A kind not used yet may be missing or null.
  lastLength: (value) =>
    isPlainObject(value) && ['play', 'free_play'].every((kind) => (value[kind] ?? null) === null || parseSessionLength(value[kind]) !== null),
  newCardsExtra: (value) =>
    isPlainObject(value) && (value.day === null || /^\d{4}-\d{2}-\d{2}$/.test(value.day)) && Number.isInteger(value.count) && value.count >= 0,
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
  if (update.playScope) update.playScope = normalizeScope(update.playScope);
  if (update.freePlayFilter) update.freePlayFilter = normalizeScope(update.freePlayFilter);
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
