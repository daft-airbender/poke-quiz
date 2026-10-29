// Standard type badge colors.
export const TYPE_COLORS = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  electric: '#F7D02C',
  grass: '#7AC74C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD',
};

// Backgrounds light enough that white text is hard to read; these get dark text.
const LIGHT_TYPES = new Set(['normal', 'electric', 'grass', 'ice', 'ground', 'bug', 'rock', 'steel', 'fairy']);

export function typeTextColor(type) {
  return LIGHT_TYPES.has(type) ? '#1d1f27' : '#ffffff';
}

export function typeLabel(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
