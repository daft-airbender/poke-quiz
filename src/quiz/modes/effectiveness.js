import { capitalize } from '../pokemon.js';
import { pick } from '../random.js';
import { defenderCombos, parseCombo } from '../typeCombos.js';
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
// A single type can only take 0×, ½×, 1× or 2×, so its questions don't offer ¼× or 4×.
const SINGLE_SCALE = SCALE.filter(([value]) => value !== 0.25 && value !== 4);

const typeNames = (types) => types.map(capitalize).join('/');

// "Fire attack vs Grass/Steel — how effective?" One mode for single-type defenders, one for dual.
// Dual defenders are real type combos from the selected Pokémon, with one of them shown as an example.
function effectivenessMode({ id, label, dual }) {
  const scale = dual ? SCALE : SINGLE_SCALE;

  return {
    id,
    label,
    answerType: 'choice',

    candidates(pool) {
      return defenderCombos(pool, { dual }).flatMap((combo) =>
        TYPES.map((attackType) => ({ key: `${id}:${attackType}>${combo.key}`, attackType, defenderTypes: combo.types, examples: combo.examples })),
      );
    },

    question({ attackType, defenderTypes, examples }, pool, random) {
      const example = pick(examples, random);
      return {
        prompt: `${capitalize(attackType)} attack vs ${typeNames(defenderTypes)} — how effective?`,
        sprite: example.sprite,
        example: example.name,
        attackType,
        defenderTypes,
        // Fixed order (not shuffled) so the scale reads left to right.
        choices: scale.map(([, choice]) => choice),
        answer: LABELS.get(multiplier(attackType, defenderTypes)),
      };
    },

    // "effectiveness-dual:fire>grass/steel"
    describe(key) {
      const [attackType, combo] = key.slice(id.length + 1).split('>');
      const defenderTypes = parseCombo(combo, { dual });
      if (!TYPES.includes(attackType) || !defenderTypes) return null;
      return {
        title: `${capitalize(attackType)} vs ${typeNames(defenderTypes)}`,
        attackType,
        defenderTypes,
        answer: LABELS.get(multiplier(attackType, defenderTypes)),
      };
    },
  };
}

export const effectivenessSingle = effectivenessMode({ id: 'effectiveness-single', label: 'Effectiveness (single)', dual: false });
export const effectivenessDual = effectivenessMode({ id: 'effectiveness-dual', label: 'Effectiveness (dual)', dual: true });
