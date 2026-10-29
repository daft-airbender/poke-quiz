import pokemon from '../../data/pokemon.json' with { type: 'json' };

export const ALL_POKEMON = pokemon;

export const GENERATIONS = [...new Set(pokemon.map((p) => p.generation))].sort((a, b) => a - b);

// Pokémon from the given generations; all of them when gens is empty.
export function pokemonInGens(gens) {
  if (!gens?.length) return ALL_POKEMON;
  const wanted = new Set(gens);
  return ALL_POKEMON.filter((p) => wanted.has(p.generation));
}

export function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
