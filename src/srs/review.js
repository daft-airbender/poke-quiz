// One answer, start to finish: FSRS update, then the tier rules. Pure; the database layer (S4) saves the
// returned card and writes `log` to review_log in one transaction.
import { SRS_CONFIG } from './config.js';
import { snapshotTier, applyTierRules } from './tiers.js';

// card: { memory, tier, ...tier fields } (see tiers.js). Free Play never comes through here: it doesn't schedule.
// Returns { card, transition, undo, log }:
//   transition: 'banked' | 'mastered' | 'back_to_rotation' | null (for the "Banked!" / "Mastered!" messages)
//   undo:       the tier fields from before, for a one-tap Undo of that transition
//   log:        the before/after values the review log stores for this answer
export function reviewCard(card, rating, now, { scheduler, config = SRS_CONFIG }) {
  const retrievability = scheduler.retrievability(card.memory, now);
  const memory = scheduler.answer(card.memory, rating, now);
  const { card: next, transition } = applyTierRules({ ...card, memory }, rating, now, config);

  return {
    card: next,
    transition,
    undo: transition ? snapshotTier(card) : null,
    log: {
      rating,
      reviewedAt: now,
      fsrsStateBefore: card.memory.state,
      stabilityBefore: card.memory.stability,
      stabilityAfter: memory.stability,
      difficultyBefore: card.memory.difficulty,
      difficultyAfter: memory.difficulty,
      retrievabilityAtReview: retrievability,
      dueBefore: card.memory.due,
      dueAfter: memory.due,
      tierBefore: card.tier,
      tierAfter: next.tier,
      bankCounterAfter: next.bankCorrectDays,
    },
  };
}
