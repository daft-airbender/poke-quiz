import { ALL_POKEMON, POKEMON_BY_ID } from '../pokemon.js';
import { sample, shuffle } from '../random.js';

// Show a sprite, pick the name from 4 options.
export default {
  id: 'name-choice',
  label: 'Name (multiple choice)',
  group: 'Names',
  description:
    "Shows a Pokémon's sprite. Pick its name from 4 options. The wrong options are from the same generation, so art style won't give it away.",
  example: 'Sprite of Pikachu → Pikachu, Raichu, Jigglypuff or Clefairy',
  answerType: 'choice',

  candidates(pool) {
    return pool.map((pokemon) => ({ key: `name-choice:${pokemon.id}`, pokemon }));
  },

  question({ pokemon }, pool, random) {
    // Same-generation distractors are harder to guess by art style alone.
    const others = (list) => list.filter((p) => p.name !== pokemon.name);
    let distractorPool = others(pool.filter((p) => p.generation === pokemon.generation));
    if (distractorPool.length < 3) distractorPool = others(ALL_POKEMON);

    const distractors = sample(distractorPool, 3, random).map((p) => p.name);
    return {
      prompt: "Who's that Pokémon?",
      sprite: pokemon.sprite,
      choices: shuffle([pokemon.name, ...distractors], random),
      answer: pokemon.name,
    };
  },

  describe(key) {
    const pokemon = POKEMON_BY_ID.get(Number(key.split(':')[1]));
    return pokemon ? { title: pokemon.name, sprite: pokemon.sprite } : null;
  },
};
