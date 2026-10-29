import { POKEMON_BY_ID } from '../pokemon.js';
import { TYPES } from '../typeEffectiveness.js';

// Show a sprite and name, select its 1 or 2 types from all 18.
// Correct only if the selected set matches exactly (checked by the frontend).
export default {
  id: 'type',
  label: 'Type',
  answerType: 'types',

  candidates(pool) {
    return pool.map((pokemon) => ({ key: `type:${pokemon.id}`, pokemon }));
  },

  question({ pokemon }) {
    return {
      prompt: `What type is ${pokemon.name}?`,
      sprite: pokemon.sprite,
      choices: TYPES,
      answer: pokemon.types,
    };
  },

  describe(key) {
    const pokemon = POKEMON_BY_ID.get(Number(key.split(':')[1]));
    return pokemon ? { title: pokemon.name, sprite: pokemon.sprite, answer: pokemon.types } : null;
  },
};
