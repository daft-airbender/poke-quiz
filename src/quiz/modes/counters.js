import { capitalize } from '../pokemon.js';
import { pick } from '../random.js';
import { defenderCombos, parseCombo } from '../typeCombos.js';
import { multiplier, TYPES } from '../typeEffectiveness.js';

const typeNames = (types) => types.map(capitalize).join('/');

// Every attacking type that's super effective (2× or 4×) against the defender, in chart order.
const countersOf = (defenderTypes) => TYPES.filter((attackType) => multiplier(attackType, defenderTypes) >= 2);

// "What's super effective against Grass/Steel?" Select all of them; 4× isn't marked separately.
// One mode for single-type defenders, one for real dual-type combos.
function countersMode({ id, label, dual, description, example }) {
  return {
    id,
    label,
    group: 'Types',
    description,
    example,
    answerType: 'types',

    candidates(pool) {
      return defenderCombos(pool, { dual }).map((combo) => ({ key: `${id}:${combo.key}`, defenderTypes: combo.types, examples: combo.examples }));
    },

    question({ defenderTypes, examples }, pool, random) {
      const example = pick(examples, random);
      return {
        prompt: `What's super effective against ${typeNames(defenderTypes)}? Select all.`,
        sprite: example.sprite,
        example: example.name,
        defenderTypes,
        choices: TYPES,
        // No limit, so the number of picks allowed doesn't hint at the answer.
        maxSelected: TYPES.length,
        answer: countersOf(defenderTypes),
      };
    },

    // "counters-dual:grass/steel"
    describe(key) {
      const defenderTypes = parseCombo(key.slice(id.length + 1), { dual });
      if (!defenderTypes) return null;
      return { title: typeNames(defenderTypes), defenderTypes, answer: countersOf(defenderTypes) };
    },
  };
}

export const countersSingle = countersMode({
  id: 'counters-single',
  label: 'Counters (single)',
  dual: false,
  description: 'Shows a defending type. Select every attacking type that is super effective (2×) against it. You need all of them, and no extras.',
  example: 'Grass → Fire, Ice, Poison, Flying, Bug',
});
export const countersDual = countersMode({
  id: 'counters-dual',
  label: 'Counters (dual)',
  dual: true,
  description:
    'Shows a two-type combo that real Pokémon have. Select every attacking type that does 2× or 4× against it. A weakness the other type cancels out (2× × ½× = 1×) doesn’t count.',
  example: 'Grass/Steel → Fire (4×), Fighting (2×)',
});
