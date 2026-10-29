import pokemon from '../../data/pokemon.json' with { type: 'json' };

export const ALL_POKEMON = pokemon;

export const POKEMON_BY_ID = new Map(pokemon.map((p) => [p.id, p]));

export const GENERATIONS = [...new Set(pokemon.map((p) => p.generation))].sort((a, b) => a - b);

// Pokémon from the given generations; all of them when gens is empty.
export function pokemonInGens(gens) {
  if (!gens?.length) return ALL_POKEMON;
  const wanted = new Set(gens);
  return ALL_POKEMON.filter((p) => wanted.has(p.generation));
}

// Each generation's region, in order. A Pokémon's region is where it debuted.
export const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Hisui', 'Paldea'];
const GENERATION_REGIONS = { 1: 'Kanto', 2: 'Johto', 3: 'Hoenn', 4: 'Sinnoh', 5: 'Unova', 6: 'Kalos', 7: 'Alola', 8: 'Galar', 9: 'Paldea' };
// Gen 8 Pokémon that debuted in Legends: Arceus: Wyrdeer, Kleavor, Ursaluna, Basculegion, Sneasler, Overqwil, Enamorus.
const HISUI_IDS = new Set([899, 900, 901, 902, 903, 904, 905]);

export function regionOf(pokemon) {
  return HISUI_IDS.has(pokemon.id) ? 'Hisui' : GENERATION_REGIONS[pokemon.generation];
}

// Pokédex numbers are shown with at least 3 digits: #025.
export function dexNumber(id) {
  return `#${String(id).padStart(3, '0')}`;
}

export function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
