import { ALL_POKEMON } from './pokemon.js';
import { TYPES } from './typeEffectiveness.js';

// Defending type combos for the matchup-style modes (Effectiveness, Counters).
// Each combo: { key: 'grass/steel', types: ['grass', 'steel'], examples: [Pokémon with exactly those types] }.
// Types in a key are sorted, so the same combo always maps to one key.
//   single: all 18 types. Examples come from the pool, else from any generation.
//   dual:   the two-type combos that Pokémon in the pool actually have.
export function defenderCombos(pool, { dual }) {
  const byKey = (pokemon) => [...pokemon.types].sort().join('/');

  if (!dual) {
    return TYPES.map((type) => {
      const pure = (list) => list.filter((p) => p.types.length === 1 && p.types[0] === type);
      const examples = pure(pool);
      return { key: type, types: [type], examples: examples.length ? examples : pure(ALL_POKEMON) };
    });
  }

  const combos = new Map();
  for (const pokemon of pool) {
    if (pokemon.types.length !== 2) continue;
    const key = byKey(pokemon);
    if (!combos.has(key)) combos.set(key, { key, types: key.split('/'), examples: [] });
    combos.get(key).examples.push(pokemon);
  }
  return [...combos.values()];
}

// 'grass/steel' -> ['grass', 'steel'] if it's a valid, sorted combo of the right size; else null.
export function parseCombo(combo, { dual }) {
  const types = String(combo).split('/');
  if (types.length !== (dual ? 2 : 1) || !types.every((type) => TYPES.includes(type))) return null;
  if (dual && !(types[0] < types[1])) return null;
  return types;
}
