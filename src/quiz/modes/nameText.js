import { lookAlikesOf } from '../lookAlikes.js';
import { POKEMON_BY_ID } from '../pokemon.js';

// Show a sprite, type the name. Spelling rules are in shared/nameMatch.js.
export default {
  id: 'name-text',
  label: 'Name (free text)',
  group: 'Names',
  description:
    "Shows a Pokémon's sprite. Type its name. Capitals, accents, spaces and punctuation don't matter. If you're only a letter or two off, you'll be asked to double-check your spelling, up to 3 tries. For a name with ♀ or ♂, type f / female or m / male.",
  example: 'Sprite of Pikachu → type “pikachu”',
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
