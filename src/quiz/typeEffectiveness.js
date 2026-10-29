import chart from '../../data/type-chart.json' with { type: 'json' };

export const TYPES = chart.types;

const typeIndex = new Map(TYPES.map((type, i) => [type, i]));

function indexOf(type) {
  const i = typeIndex.get(type);
  if (i === undefined) throw new Error(`Unknown type: ${type}`);
  return i;
}

// Damage multiplier of an attacking type against a defender with one or two types.
// Returns one of 0, 0.25, 0.5, 1, 2, 4.
export function multiplier(attackType, defenderTypes) {
  const row = chart.matrix[indexOf(attackType)];
  return defenderTypes.reduce((product, type) => product * row[indexOf(type)], 1);
}
