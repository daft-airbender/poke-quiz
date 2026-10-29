import { ALL_POKEMON, POKEMON_BY_ID } from '../pokemon.js';

const HIGHEST_NUMBER = Math.max(...ALL_POKEMON.map((p) => p.id));

// Show a Pokémon, enter its exact Pokédex number.
export default {
  id: 'mon-to-dex',
  label: 'Pokémon → Pokédex #',
  group: 'Pokédex',
  description:
    'Shows a Pokémon and its name. Enter its National Pokédex number. Only the exact number counts.',
  example: 'Pikachu → 25',
  answerType: 'number',

  candidates(pool) {
    return pool.map((pokemon) => ({ key: `mon-to-dex:${pokemon.id}`, pokemon }));
  },

  question({ pokemon }) {
    return {
      prompt: `What's ${pokemon.name}'s Pokédex number?`,
      sprite: pokemon.sprite,
      max: HIGHEST_NUMBER,
      answer: pokemon.id,
    };
  },

  describe(key) {
    const pokemon = POKEMON_BY_ID.get(Number(key.split(':')[1]));
    return pokemon ? { title: pokemon.name, sprite: pokemon.sprite, answer: pokemon.id } : null;
  },
};
