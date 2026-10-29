import { ALL_POKEMON, POKEMON_BY_ID, regionOf } from '../pokemon.js';
import { sample, shuffle } from '../random.js';

// Wrong options come from other regions at most this many generations away, so they share
// an art style with the answer and it can't be picked out by looks alone.
const MAX_GENERATION_GAP = 2;

// "Which of these is from Kanto?" One card per Pokémon (the fact is "Charmander is from Kanto"),
// with 3 fresh wrong options each time. Options show sprite and name.
export default {
  id: 'region-to-mon',
  label: 'Region → Pokémon',
  group: 'Regions',
  // A generation filter would give the answer away (only Gen 1 = always Kanto), so rounds always use every generation.
  allGenerations: true,
  description:
    'Shows a region. Pick which of 4 Pokémon debuted there. The wrong options come from other regions at most 2 generations away, so they look similar.',
  example: 'Kanto → Charmander (not Totodile, Mudkip or Chikorita)',
  answerType: 'choice',

  candidates(pool) {
    return pool.map((pokemon) => ({ key: `region-to-mon:${pokemon.id}`, pokemon }));
  },

  question({ pokemon }, pool, random) {
    const region = regionOf(pokemon);
    // From any generation, not just the selected ones: with Gen 1 only, every wrong option is outside the pool.
    const distractorPool = ALL_POKEMON.filter(
      (p) => regionOf(p) !== region && Math.abs(p.generation - pokemon.generation) <= MAX_GENERATION_GAP,
    );
    const options = [pokemon, ...sample(distractorPool, 3, random)];
    return {
      prompt: `Which of these is from ${region}?`,
      choices: shuffle(options.map((p) => p.name), random),
      choiceSprites: Object.fromEntries(options.map((p) => [p.name, p.sprite])),
      answer: pokemon.name,
    };
  },

  describe(key) {
    const pokemon = POKEMON_BY_ID.get(Number(key.split(':')[1]));
    return pokemon ? { title: `${pokemon.name} (${regionOf(pokemon)})`, sprite: pokemon.sprite } : null;
  },
};
