import { POKEMON_BY_ID, REGIONS, regionOf } from '../pokemon.js';

// Show a Pokémon, pick the region it debuted in from all of them.
export default {
  id: 'mon-to-region',
  label: 'Pokémon → Region',
  group: 'Regions',
  // A generation filter would give the answer away (only Gen 1 = always Kanto), so rounds always use every generation.
  allGenerations: true,
  allGenerationsNote: 'Picking one would give the region away.',
  description:
    'Shows a Pokémon. Pick the region it debuted in, from all 10. The seven Pokémon introduced in Legends: Arceus count as Hisui.',
  example: 'Pikachu → Kanto · Kleavor → Hisui',
  answerType: 'choice',

  candidates(pool) {
    return pool.map((pokemon) => ({ key: `mon-to-region:${pokemon.id}`, pokemon }));
  },

  question({ pokemon }) {
    return {
      prompt: `Which region is ${pokemon.name} from?`,
      sprite: pokemon.sprite,
      // Always every region, in game order.
      choices: REGIONS,
      answer: regionOf(pokemon),
    };
  },

  describe(key) {
    const pokemon = POKEMON_BY_ID.get(Number(key.split(':')[1]));
    return pokemon ? { title: pokemon.name, sprite: pokemon.sprite, answer: regionOf(pokemon) } : null;
  },
};
