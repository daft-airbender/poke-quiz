import { lookAlikesOf } from '../lookAlikes.js';
import { POKEMON_BY_ID } from '../pokemon.js';

// Show a sprite, type the name. Spelling rules are in shared/nameMatch.js.
export default {
  id: 'name-text',
  label: 'Name (free text)',
  group: 'Names',
  answerType: 'text',

  candidates(pool) {
    return pool.map((pokemon) => ({ key: `name-text:${pokemon.id}`, pokemon }));
  },

  question({ pokemon }) {
    return {
      prompt: "Who's that Pokémon?",
      sprite: pokemon.sprite,
      answer: pokemon.name,
      lookAlikes: lookAlikesOf(pokemon.name),
    };
  },

  describe(key) {
    const pokemon = POKEMON_BY_ID.get(Number(key.split(':')[1]));
    return pokemon ? { title: pokemon.name, sprite: pokemon.sprite } : null;
  },
};
