// Picks the next card in a Play session (spec: "Session queue"). Pure: the caller loads the cards.
// Re-pick after every answer, since each answer changes the order.
//
// Tiers, in order (cards in their repeat cooldown are skipped, except due learning steps):
//   1. due learning/relearning steps, earliest due first                          -> mode 'due'
//   2. due rotation reviews and bank check-ins (R below the threshold), lowest R   -> 'due' / 'bank_checkin'
//   3. new cards, up to the daily limit (+ "add more"), in introduction order      -> 'new'
//   4. keep playing: studied rotation cards not answered today, lowest R first      -> 'ahead'
//      (a repeat the same day adds almost nothing to memory, so it doesn't count as working ahead)
//   5. nothing left: return null with what can be offered (more new cards, practice the bank, Free Play)
// Mastered cards never appear. Banked cards only appear as check-ins.
import { SRS_CONFIG } from './config.js';
import { shuffle } from '../quiz/random.js';
import { dayKey } from './days.js';
import { bankAnswerWouldCount } from './tiers.js';

const MINUTE = 60 * 1000;

// Is `cardId` still in its repeat cooldown? It ends after `cooldown.cards` other cards have been shown
// or `cooldown.minutes` have passed, whichever comes first.
// recent: this session's showings, oldest first: [{ cardId, at }]
export function inCooldown(cardId, recent, now, config = SRS_CONFIG) {
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].cardId !== cardId) continue;
    const cardsSince = recent.length - 1 - i;
    const minutesSince = (now - recent[i].at) / MINUTE;
    return cardsSince < config.repeatCooldown.cards && minutesSince < config.repeatCooldown.minutes;
  }
  return false;
}

// How many new cards can still be introduced today.
// newToday: { introducedToday, extraToday, limit } where limit is the user's daily limit (null = unlimited).
export function newCardsLeft({ introducedToday, extraToday = 0, limit = SRS_CONFIG.newCardsPerDay }) {
  return limit == null ? Infinity : Math.max(0, limit + extraToday - introducedToday);
}

// The Play scope setting ("What to learn"): which modes and generations new cards come from.
// scope: { modes: [ids] | null, gens: [numbers] | null }; null = all. Cards with no generation
// (type-chart cards) only depend on the mode, and so do modes that always use every generation
// (allGenerationModes: region modes, where a generation filter would give the answer away).
export function inPlayScope(card, scope, allGenerationModes = []) {
  if (scope?.modes && !scope.modes.includes(card.cardType)) return false;
  if (allGenerationModes.includes(card.cardType)) return true;
  if (scope?.gens && card.generation != null && !scope.gens.includes(card.generation)) return false;
  return true;
}

// The order new cards are introduced in: card types take turns (so one mode doesn't fill a session, and one
// Pokémon doesn't arrive seven ways at once); within a type, random (not Pokédex order).
//   unseen:      cards never answered, each { id, cardType, ... }
//   studiedByType: { [cardType]: number of cards of that type already introduced }
//   typeOrder:   card types in registry order, for ties
export function orderNewCards(unseen, studiedByType, typeOrder, random = Math.random) {
  const queues = new Map(typeOrder.map((type) => [type, []]));
  for (const card of unseen) queues.get(card.cardType)?.push(card);
  for (const [type, queue] of queues) queues.set(type, shuffle(queue, random));

  const counts = new Map(typeOrder.map((type) => [type, studiedByType[type] ?? 0]));
  const ordered = [];
  while (ordered.length < unseen.length) {
    // The type with the fewest cards introduced so far goes next (registry order breaks ties).
    let type = null;
    for (const [candidate, queue] of queues) {
      if (queue.length && (type === null || counts.get(candidate) < counts.get(type))) type = candidate;
    }
    if (type === null) break; // cards of unknown types are left out
    ordered.push(queues.get(type).shift());
    counts.set(type, counts.get(type) + 1);
  }
  return ordered;
}

// Of these cards, the one whose last showing this session is oldest (never shown counts as oldest).
function shownLongestAgo(cards, recent) {
  const lastShown = (card) => recent.findLastIndex((showing) => showing.cardId === card.id);
  return [...cards].sort((a, b) => lastShown(a) - lastShown(b))[0];
}

// studied:  cards answered at least once: [{ id, tier, memory, ... }]
// newCards: unseen cards in scope, already in introduction order (orderNewCards)
// newCards: unseen cards in scope, in introduction order (whether or not today's limit allows any).
// Returns { card, mode } or { card: null, canAddNew, canPracticeBank }.
export function pickNextCard({ studied, newCards, recent, now, scheduler, newToday, config = SRS_CONFIG, random = Math.random }) {
  const r = (card) => scheduler.retrievability(card.memory, now);
  const cooling = (card) => inCooldown(card.id, recent, now, config);
  // Lowest R first; ties (common: R counts whole days, so everything studied today is at 100%) in random order,
  // not catalog order.
  const lowestR = (cards) => cards.map((card) => ({ card, r: r(card), tie: random() })).sort((a, b) => a.r - b.r || a.tie - b.tie)[0]?.card;
  const rotation = studied.filter((card) => card.tier === 'rotation');

  // 1. Due learning steps: these are exempt from the cooldown.
  const steps = rotation
    .filter((card) => (card.memory.state === 'learning' || card.memory.state === 'relearning') && card.memory.due <= now)
    .sort((a, b) => a.memory.due - b.memory.due);
  if (steps.length) return { card: steps[0], mode: 'due' };

  // 2. Due reviews and bank check-ins, lowest R first.
  const dueReviews = rotation.filter((card) => card.memory.state === 'review' && card.memory.due <= now && !cooling(card));
  const checkIns = studied.filter((card) => card.tier === 'bank' && !cooling(card) && r(card) < config.bank.checkInBelowRetrievability);
  const due = lowestR([...dueReviews, ...checkIns]);
  if (due) return { card: due, mode: due.tier === 'bank' ? 'bank_checkin' : 'due' };

  // 3. New cards, within today's allowance.
  if (newCardsLeft(newToday) > 0 && newCards.length) return { card: newCards[0], mode: 'new' };

  // 4. Keep playing: rotation cards not already answered today, weakest first.
  const today = dayKey(now, config.timeZone);
  const notToday = rotation.filter((card) => !card.memory.lastReviewAt || dayKey(card.memory.lastReviewAt, config.timeZone) !== today);
  const ahead = lowestR(notToday.filter((card) => !cooling(card)));
  if (ahead) return { card: ahead, mode: 'ahead' };
  // The cooldown is a preference, not a wall: if it's the only thing in the way, take the card shown longest ago.
  if (notToday.length) return { card: shownLongestAgo(notToday, recent), mode: 'ahead' };

  // 5. Nothing to play: offer more new cards or bank practice.
  // More new cards can be added only when a daily limit is what's holding them back.
  return { card: null, canAddNew: newCards.length > 0 && newCardsLeft(newToday) === 0, canPracticeBank: studied.some((card) => card.tier === 'bank') };
}

// "Practice the bank" / "Practice mastered": only that tier, lowest R first, cooldown as above.
// In the bank, cards whose correct answer would count toward Mastered today come first: practicing the
// others can't move them along yet.
export function pickPracticeCard({ studied, tier, recent, now, scheduler, config = SRS_CONFIG }) {
  const pool = studied.filter((card) => card.tier === tier);
  const ready = pool.filter((card) => !inCooldown(card.id, recent, now, config));
  const r = (card) => scheduler.retrievability(card.memory, now);
  const counts = (card) => (tier === 'bank' && bankAnswerWouldCount(card, now, config) ? 0 : 1);
  const card = ready.length ? [...ready].sort((a, b) => counts(a) - counts(b) || r(a) - r(b))[0] : pool.length ? shownLongestAgo(pool, recent) : null;
  return card ? { card, mode: tier === 'bank' ? 'bank_practice' : 'mastered_practice' } : { card: null };
}
