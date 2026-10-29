// Small random helpers. `random` is injectable so tests can be deterministic.

// Returns a shuffled copy (Fisher–Yates).
export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Up to n distinct items, in random order.
export function sample(items, n, random = Math.random) {
  return shuffle(items, random).slice(0, n);
}

export function pick(items, random = Math.random) {
  return items[Math.floor(random() * items.length)];
}

// Up to n distinct items, each picked with probability proportional to weightOf(item)
// (Efraimidis–Spirakis: sort by random^(1/weight)). Weights must be positive.
// Returned in random order, so heavily weighted items don't all come first.
export function weightedSample(items, n, weightOf, random = Math.random) {
  const chosen = items
    .map((item) => ({ item, rank: random() ** (1 / weightOf(item)) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, n)
    .map(({ item }) => item);
  return shuffle(chosen, random);
}
