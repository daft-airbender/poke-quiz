// One answer, start to finish: FSRS update, then the tier rules. Pure; the database layer (S4) saves the
// returned card and writes `log` to review_log in one transaction.
import { SRS_CONFIG } from './config.js';
import { snapshotTier, applyTierRules } from './tiers.js';

// Answers that are logged but never schedule: Free Play, and wrap-up reviews of missed cards in Play and practice
// (the first-attempt miss is the rating that counts). Older wrap-up rows did schedule; they keep their real mode.
export const UNSCHEDULED_MODES = ['free_play', 'wrapup'];

// The review_log values for an unscheduled answer: rating 1 = wrong, 3 = right, and every FSRS and tier "before"
// value equal to its "after" value. The card itself doesn't change.
export function unscheduledLog(card, correct, now, { scheduler }) {
  const { memory } = card;
  return {
    rating: correct ? 3 : 1,
    reviewedAt: now,
    fsrsStateBefore: memory.state,
    stabilityBefore: memory.stability,
    stabilityAfter: memory.stability,
    difficultyBefore: memory.difficulty,
    difficultyAfter: memory.difficulty,
    retrievabilityAtReview: scheduler.retrievability(memory, now),
    dueBefore: memory.due,
    dueAfter: memory.due,
    tierBefore: card.tier,
    tierAfter: card.tier,
    bankCounterAfter: card.bankCorrectDays,
  };
}

// card: { memory, tier, ...tier fields } (see tiers.js). Unscheduled answers never come through here.
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
