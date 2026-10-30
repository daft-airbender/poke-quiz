// Tier rules on top of FSRS (spec: "Bank and Mastered"). Pure: every function returns a new card.
//
//   rotation --(stability >= 30 days)--> bank --(3 counted correct days, 7+ days apart)--> mastered
//      ^                                  |                                                  |
//      +------------- any miss -----------+-------------------- any miss --------------------+
//
// A card here is { memory, tier, bankedAt, masteredAt, bankCorrectDays, bankLastCounted, bankPrevCounted, isLeech },
// where memory is the FSRS CardMemory (src/srs/scheduler.js) and the bank days are 'YYYY-MM-DD' (New York).
// FSRS memory and tier are kept apart: moving between tiers never touches the memory model.
import { SRS_CONFIG } from './config.js';
import { dayKey, daysBetween } from './days.js';
import { RATING } from './scheduler.js';

// The fields Undo restores (see snapshotTier / restoreTier).
const TIER_FIELDS = ['tier', 'bankedAt', 'masteredAt', 'bankCorrectDays', 'bankLastCounted', 'bankPrevCounted'];

// A card nobody has answered yet.
export function newTierFields() {
  return { tier: 'rotation', bankedAt: null, masteredAt: null, bankCorrectDays: 0, bankLastCounted: null, bankPrevCounted: null, isLeech: false };
}

export function snapshotTier(card) {
  return Object.fromEntries(TIER_FIELDS.map((field) => [field, card[field]]));
}

// Undo for "Banked!" / "Mastered!": puts back the exact tier and counter from before. FSRS memory is kept.
export function restoreTier(card, snapshot) {
  return { ...card, ...snapshot };
}

// A miss takes away one counted day (never below 0). If a day was already counted earlier today,
// that +1 is taken back too (the miss decides the day), and the previous last-counted day returns.
function applyMissToCounter(card, today) {
  let { bankCorrectDays: count, bankLastCounted: last, bankPrevCounted: prev } = card;
  if (last === today) {
    count -= 1;
    last = prev;
    prev = null;
  }
  return { bankCorrectDays: Math.max(0, count - 1), bankLastCounted: last, bankPrevCounted: prev };
}

// A correct answer while banked counts (+1) if it's at least 7 days after the later of the last counted day
// and the day the card (last) entered the bank. Several correct answers in one day can only count once.
function countsAsCorrectDay(card, today, config) {
  const bankedDay = dayKey(card.bankedAt, config.timeZone);
  const since = card.bankLastCounted && card.bankLastCounted >= bankedDay ? card.bankLastCounted : bankedDay;
  return daysBetween(since, today) >= config.mastery.minDaysBetweenCountedDays;
}

// Would a correct answer to this banked card count toward Mastered if given at `now`? (Home's nudge and
// bank practice's order use this; the database has the same rule in bankCountsTodaySql.)
export function bankAnswerWouldCount(card, now, config = SRS_CONFIG) {
  return card.tier === 'bank' && countsAsCorrectDay(card, dayKey(now, config.timeZone), config);
}

// Applies the tier rules after an answer. `card.memory` must already be the FSRS state *after* the answer.
// Returns { card, transition } where transition is 'banked' | 'mastered' | 'back_to_rotation' | null.
export function applyTierRules(card, rating, now, config = SRS_CONFIG) {
  const today = dayKey(now, config.timeZone);
  const missed = rating === RATING.again;
  let next = { ...card };
  let transition = null;

  // Leeches: flagged once, never auto-suspended (spec: "Leeches").
  if (next.memory.lapses >= config.leechLapses) next.isLeech = true;

  if (card.tier === 'rotation') {
    const qualifies = next.memory.state === 'review' && !missed && next.memory.stability >= config.bank.minStabilityDays;
    if (config.bank.autoBank && qualifies) {
      next = { ...next, tier: 'bank', bankedAt: now };
      transition = 'banked';
    }
  } else if (missed) {
    // A miss on a banked or mastered card sends it back to rotation; the counter is kept (minus the miss).
    next = { ...next, ...applyMissToCounter(card, today), tier: 'rotation' };
    transition = 'back_to_rotation';
  } else if (card.tier === 'bank' && countsAsCorrectDay(card, today, config)) {
    next = {
      ...next,
      bankCorrectDays: card.bankCorrectDays + 1,
      bankPrevCounted: card.bankLastCounted,
      bankLastCounted: today,
    };
    if (next.bankCorrectDays >= config.mastery.requiredCorrectDays) {
      next = { ...next, tier: 'mastered', masteredAt: now };
      transition = 'mastered';
    }
  }
  // Correct answers on mastered cards (practice) update FSRS only: only answers while banked count.

  return { card: next, transition };
}

// Which manual actions make sense for a card in each tier ('unseen' = never answered, no card_state).
export const ACTIONS_BY_TIER = {
  unseen: ['move_to_bank', 'mark_mastered'],
  rotation: ['move_to_bank', 'mark_mastered'],
  bank: ['restore', 'mark_mastered'],
  mastered: ['restore', 'demote'],
};

// A card never answered has no memory to schedule check-ins from (its recall chance would read 0%, so it
// would come straight back as a check-in). Moving it to the bank or mastered means "I already know this",
// so it starts as if just reviewed with the bank's entry stability: its first check-in comes when recall
// is predicted to drop below the check-in threshold, about 100 days later. Deterministic, so replayable.
function knownCardMemory(memory, now, config) {
  const stability = config.bank.minStabilityDays;
  return {
    ...memory,
    state: 'review',
    stability,
    difficulty: config.manualKnownDifficulty,
    lastReviewAt: now,
    due: new Date(now.getTime() + stability * 24 * 60 * 60 * 1000),
  };
}

// Manual actions from the card screens (spec: "Screens and actions"). They skip the automatic rules.
//   restore:       bank/mastered -> rotation, due now; FSRS state and counter kept
//   demote:        mastered -> bank (back on check-ins); the 7-day wait starts again
//   move_to_bank:  any -> bank, for cards I already know cold
//   mark_mastered: any -> mastered
export function manualTierChange(card, action, now, config = SRS_CONFIG) {
  if ((action === 'move_to_bank' || action === 'mark_mastered') && card.memory.state === 'new') {
    card = { ...card, memory: knownCardMemory(card.memory, now, config) };
  }
  switch (action) {
    case 'restore':
      return { ...card, tier: 'rotation', memory: { ...card.memory, due: now } };
    case 'demote':
      if (card.tier !== 'mastered') throw new Error('Only mastered cards can be demoted');
      return { ...card, tier: 'bank', bankedAt: now };
    case 'move_to_bank':
      return { ...card, tier: 'bank', bankedAt: now };
    case 'mark_mastered':
      return { ...card, tier: 'mastered', masteredAt: now };
    default:
      throw new Error(`Unknown tier action: ${action}`);
  }
}
