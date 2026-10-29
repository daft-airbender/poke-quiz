import { capitalize } from '../pokemon.js';
import { pick } from '../random.js';
import { multiplier, TYPES } from '../typeEffectiveness.js';

// [multiplier, label] in ascending order. (An object literal would reorder these: JS puts
// integer-like keys like 0, 1, 2, 4 before 0.25 and 0.5.)
const SCALE = [
  [0, '0×'],
  [0.25, '¼×'],
  [0.5, '½×'],
  [1, '1×'],
  [2, '2×'],
  [4, '4×'],
];
const LABELS = new Map(SCALE);

// "Fire attack vs Grass/Steel — how effective?" Defenders are real type combos from the
// selected Pokémon, with one of them shown as an example.
export default {
  id: 'matchup',
  label: 'Matchup',
  answerType: 'choice',

  candidates(pool) {
    // Sorted type combo ("grass/steel") -> Pokémon that have it.
    const combos = new Map();
    for (const pokemon of pool) {
      const combo = [...pokemon.types].sort().join('/');
      if (!combos.has(combo)) combos.set(combo, []);
      combos.get(combo).push(pokemon);
    }

    const candidates = [];
    for (const [combo, examples] of combos) {
      for (const attackType of TYPES) {
        candidates.push({ key: `matchup:${attackType}>${combo}`, attackType, defenderTypes: combo.split('/'), examples });
      }
    }
    return candidates;
  },

  question({ attackType, defenderTypes, examples }, pool, random) {
    const example = pick(examples, random);
    return {
      prompt: `${capitalize(attackType)} attack vs ${defenderTypes.map(capitalize).join('/')} — how effective?`,
      sprite: example.sprite,
      example: example.name,
      attackType,
      defenderTypes,
      // Fixed order (not shuffled) so the scale reads left to right.
      choices: SCALE.map(([, label]) => label),
      answer: LABELS.get(multiplier(attackType, defenderTypes)),
    };
  },
};
