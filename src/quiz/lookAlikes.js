import { allowedTypos, editDistance, normalizeName } from '../../shared/nameMatch.js';
import { ALL_POKEMON } from './pokemon.js';

const normalized = ALL_POKEMON.map((pokemon) => ({ name: pokemon.name, key: normalizeName(pokemon.name) }));
const cache = new Map();

// Other Pokémon whose names are within typo distance of this one (e.g. Porygon2 -> Porygon, Porygon-Z).
// Sent with free-text questions so the browser can tell a typo from a different Pokémon.
export function lookAlikesOf(name) {
  if (!cache.has(name)) {
    const target = normalizeName(name);
    const limit = allowedTypos(target);
    cache.set(
      name,
      normalized.filter((other) => other.name !== name && editDistance(other.key, target) <= limit).map((other) => other.name),
    );
  }
  return cache.get(name);
}
