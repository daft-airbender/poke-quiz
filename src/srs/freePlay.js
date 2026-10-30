// Free Play: a sandbox that never changes scheduling (spec: "Free Play"). Pure helpers.

// Order: shuffled, with no repeats until every card in the filter has been shown once, then a fresh pass.
// shown: card ids shown this session (wrap-ups excluded), oldest first; poolSize: cards in the filter.
// Returns the ids already shown in the current pass (to leave out of the next pick).
export function shownThisPass(shown, poolSize) {
  let pass = new Set();
  for (const id of shown) {
    if (pass.size >= poolSize) pass = new Set();
    pass.add(id);
  }
  return pass.size >= poolSize ? new Set() : pass;
}

// Accuracy per card type for this session's answers: [{ cardType, answered, correct }], in the order seen.
export function accuracyByType(answers) {
  const byType = new Map();
  for (const { cardType, correct } of answers) {
    const row = byType.get(cardType) ?? { cardType, answered: 0, correct: 0 };
    row.answered++;
    if (correct) row.correct++;
    byType.set(cardType, row);
  }
  return [...byType.values()];
}
