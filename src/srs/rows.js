// Converts between card_state rows (as Drizzle returns them) and the card shape the SRS rules use
// ({ memory, tier, ...tier fields }, see tiers.js). Pure.

// card_state row -> card. A missing row means the card has never been answered.
export function cardFromRow(row) {
  return {
    memory: {
      state: row.fsrsState,
      due: row.dueAt,
      stability: row.stability,
      difficulty: row.difficulty,
      reps: row.reps,
      lapses: row.lapses,
      learningStep: row.learningStep,
      lastReviewAt: row.lastReviewAt,
    },
    tier: row.tier,
    bankedAt: row.bankedAt,
    masteredAt: row.masteredAt,
    bankCorrectDays: row.bankCorrectDays,
    bankLastCounted: row.bankLastCounted,
    bankPrevCounted: row.bankPrevCounted,
    isLeech: row.isLeech,
  };
}

// card -> the card_state columns to write (user_id and card_id are added by the caller).
export function rowFromCard(card) {
  const { memory } = card;
  return {
    fsrsState: memory.state,
    dueAt: memory.due,
    stability: memory.stability,
    difficulty: memory.difficulty,
    reps: memory.reps,
    lapses: memory.lapses,
    learningStep: memory.learningStep,
    lastReviewAt: memory.lastReviewAt,
    tier: card.tier,
    bankedAt: card.bankedAt,
    masteredAt: card.masteredAt,
    bankCorrectDays: card.bankCorrectDays,
    bankLastCounted: card.bankLastCounted,
    bankPrevCounted: card.bankPrevCounted,
    isLeech: card.isLeech,
  };
}

// Tier fields saved for Undo (card_events.undo_to is JSON, so dates arrive as strings) -> real values.
export function tierSnapshotFromJson(json) {
  const toDate = (value) => (value == null ? null : new Date(value));
  return { ...json, bankedAt: toDate(json.bankedAt), masteredAt: toDate(json.masteredAt) };
}
