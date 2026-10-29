// Matching typed Pokémon names. Shared by the server (which lists look-alike names per question)
// and the browser (which checks the answer), so both always agree. Plain JS, no dependencies.

// Lowercase, no accents, no spaces or punctuation; ♀/♂ become f/m.
// "Farfetch’d" -> "farfetchd", "Mr. Mime" -> "mrmime", "Flabébé" -> "flabebe", "Nidoran♀" -> "nidoranf".
export function normalizeName(name) {
  return name
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// How many typos still count as "close": 1 for short names, 2 for longer ones.
export function allowedTypos(normalizedAnswer) {
  return normalizedAnswer.length <= 5 ? 1 : 2;
}

// Edits needed to turn a into b: a wrong, missing, or extra letter, or two swapped neighbors, each count as one
// (optimal string alignment distance).
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// 'correct' | 'close' | 'wrong'.
// lookAlikes: other Pokémon names close to the answer. Typing one of those is a real mix-up, not a typo,
// so it's 'wrong' (e.g. "Porygon-Z" when the answer is Porygon2).
export function matchName(typed, answer, lookAlikes = []) {
  const value = normalizeName(typed);
  const target = normalizeName(answer);
  if (value === target) return 'correct';
  if (lookAlikes.some((name) => normalizeName(name) === value)) return 'wrong';
  return editDistance(value, target) <= allowedTypos(target) ? 'close' : 'wrong';
}
