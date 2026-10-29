import { lookAlikesOf } from '../lookAlikes.js';
import { dexNumber, POKEMON_BY_ID } from '../pokemon.js';

// Show a Pokédex number, type the Pokémon's name. No sprite: it would give the answer away.
export default {
  id: 'dex-to-mon',
  label: 'Pokédex # → Pokémon',
  group: 'Pokédex',
  answerType: 'text',

  candidates(pool) {
    return pool.map((pokemon) => ({ key: `dex-to-mon:${pokemon.id}`, pokemon }));
  },

  question({ pokemon }) {
    return {
      prompt: `Which Pokémon is ${dexNumber(pokemon.id)}?`,
      answer: pokemon.name,
      lookAlikes: lookAlikesOf(pokemon.name),
    };
  },

  describe(key) {
    const pokemon = POKEMON_BY_ID.get(Number(key.split(':')[1]));
    return pokemon ? { title: dexNumber(pokemon.id), sprite: pokemon.sprite, answer: pokemon.name } : null;
  },
};
