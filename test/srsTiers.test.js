import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SRS_CONFIG } from '../src/srs/config.js';
import { dayKey, daysBetween } from '../src/srs/days.js';
import { reviewCard } from '../src/srs/review.js';
import { createScheduler, newCardMemory, RATING } from '../src/srs/scheduler.js';
import { applyTierRules, manualTierChange, newTierFields, restoreTier } from '../src/srs/tiers.js';

const scheduler = createScheduler();
// Noon in New York on day n (n = 0 is 2026-11-01), so every day is a clear calendar day.
const day = (n, hour = 12) => new Date(Date.UTC(2026, 10, 1 + n, hour + 5));
const { good, again } = RATING;

// A review-state memory with the given stability (the tier rules only read state, stability and lapses).
const memory = (stability, extra = {}) => ({ ...newCardMemory(), state: 'review', stability, difficulty: 5, reps: 5, ...extra });
const rotationCard = (stability = 40) => ({ ...newTierFields(), memory: memory(stability) });
const bankedCard = (bankedDay = 0, extra = {}) => ({ ...rotationCard(60), tier: 'bank', bankedAt: day(bankedDay), ...extra });

// Answers a card (tier rules only; memory kept as given) and returns the new card.
const answer = (card, rating, when) => applyTierRules(card, rating, when).card;

test('New York calendar days, including the end of daylight saving time', () => {
  assert.equal(dayKey(new Date('2026-11-02T04:30:00Z')), '2026-11-01', '11:30 pm EST is still Nov 1');
  assert.equal(dayKey(new Date('2026-11-02T05:30:00Z')), '2026-11-02');
  assert.equal(dayKey(new Date('2026-07-01T03:59:00Z')), '2026-06-30', '11:59 pm EDT');
  assert.equal(daysBetween('2026-11-01', '2026-11-08'), 7);
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2, 'across the spring-forward night');
  assert.equal(daysBetween('2026-11-08', '2026-11-01'), -7);
});

test('rotation -> bank only with stability >= 30 days, in review, and not an Again', () => {
  const banked = applyTierRules(rotationCard(30), good, day(0));
  assert.equal(banked.transition, 'banked');
  assert.equal(banked.card.tier, 'bank');
  assert.equal(+banked.card.bankedAt, +day(0));

  assert.equal(applyTierRules(rotationCard(29.9), good, day(0)).card.tier, 'rotation', 'stability too low');
  assert.equal(applyTierRules(rotationCard(40), again, day(0)).card.tier, 'rotation', 'Again never banks');
  const learning = { ...rotationCard(40), memory: memory(40, { state: 'relearning' }) };
  assert.equal(applyTierRules(learning, good, day(0)).card.tier, 'rotation', 'must be in review');
  const noAuto = { ...SRS_CONFIG, bank: { ...SRS_CONFIG.bank, autoBank: false } };
  assert.equal(applyTierRules(rotationCard(40), good, day(0), noAuto).card.tier, 'rotation', 'auto-bank off');
});

test('many correct answers on the same day never bank a card', () => {
  let card = { ...newTierFields(), memory: newCardMemory() };
  for (let i = 0; i < 50; i++) card = reviewCard(card, good, new Date(+day(0) + i * 60_000), { scheduler }).card;
  assert.equal(card.tier, 'rotation');
  assert.ok(card.memory.stability < SRS_CONFIG.bank.minStabilityDays, `stability ${card.memory.stability}`);
});

test("the spec's example: banked Day 0, correct Days 3, 8, 10, 16, 23 -> 0, 1, 1, 2, 3 -> mastered Day 23", () => {
  let card = bankedCard(0);
  const counts = [];
  let transition = null;
  for (const n of [3, 8, 10, 16, 23]) {
    ({ card, transition } = applyTierRules(card, good, day(n)));
    counts.push(card.bankCorrectDays);
  }
  assert.deepEqual(counts, [0, 1, 1, 2, 3]);
  assert.equal(transition, 'mastered');
  assert.equal(card.tier, 'mastered');
  assert.equal(+card.masteredAt, +day(23));
});

test('several correct answers in one day count once', () => {
  let card = bankedCard(0);
  for (const hour of [8, 12, 20]) card = answer(card, good, day(7, hour));
  assert.equal(card.bankCorrectDays, 1);
  assert.equal(card.bankLastCounted, '2026-11-08');
});

test('a miss while banked: counter -1 (never below 0), back to rotation, counter kept', () => {
  const two = bankedCard(0, { bankCorrectDays: 2, bankLastCounted: '2026-11-17', bankPrevCounted: '2026-11-09' });
  const { card, transition } = applyTierRules(two, again, day(20));
  assert.equal(transition, 'back_to_rotation');
  assert.equal(card.tier, 'rotation');
  assert.equal(card.bankCorrectDays, 1);
  assert.equal(card.bankLastCounted, '2026-11-17', 'last counted day unchanged on another day');

  assert.equal(answer(bankedCard(0), again, day(3)).bankCorrectDays, 0, 'floor at 0');
});

test('a miss decides the day: an earlier +1 the same day is taken back too', () => {
  let card = bankedCard(0, { bankCorrectDays: 1, bankLastCounted: '2026-11-09', bankPrevCounted: null });
  card = answer(card, good, day(15, 9)); // counts: 2, last = Nov 16
  assert.equal(card.bankCorrectDays, 2);
  card = answer(card, again, day(15, 18)); // same day: undo the +1, then -1
  assert.equal(card.bankCorrectDays, 0, 'net -1 for the day');
  assert.equal(card.bankLastCounted, '2026-11-09', 'previous last-counted day restored');
  assert.equal(card.tier, 'rotation');
});

test('a re-banked card continues its counter, and the 7-day wait restarts from the new banking date', () => {
  // Counter 2, then a miss: 1, back to rotation.
  let card = answer(bankedCard(0, { bankCorrectDays: 2, bankLastCounted: '2026-11-17', bankPrevCounted: '2026-11-09' }), again, day(20));
  assert.equal(card.bankCorrectDays, 1);
  // Banked again on Day 40.
  card = { ...card, memory: memory(60) };
  card = applyTierRules(card, good, day(40)).card;
  assert.equal(card.tier, 'bank');
  assert.equal(card.bankCorrectDays, 1, 'continues where it left off');
  // Day 45 is 28 days after the last counted day but only 5 after re-banking: doesn't count.
  card = answer(card, good, day(45));
  assert.equal(card.bankCorrectDays, 1);
  card = answer(card, good, day(47));
  assert.equal(card.bankCorrectDays, 2);
  const { card: done, transition } = applyTierRules(card, good, day(54));
  assert.equal(done.bankCorrectDays, 3);
  assert.equal(transition, 'mastered', 'needed 2 more counted days');
});

test('mastered cards: a correct practice answer changes nothing, a miss sends them back to rotation with -1', () => {
  const mastered = bankedCard(0, { tier: 'mastered', masteredAt: day(23), bankCorrectDays: 3, bankLastCounted: '2026-11-24' });
  const right = applyTierRules(mastered, good, day(40));
  assert.equal(right.transition, null);
  assert.equal(right.card.tier, 'mastered');
  assert.equal(right.card.bankCorrectDays, 3);

  const wrong = applyTierRules(mastered, again, day(40));
  assert.equal(wrong.transition, 'back_to_rotation');
  assert.equal(wrong.card.tier, 'rotation');
  assert.equal(wrong.card.bankCorrectDays, 2);
});

test('undo restores the exact previous tier and counter, keeping the FSRS memory', () => {
  // Banking.
  const before = { ...newTierFields(), memory: newCardMemory() };
  let card = before;
  card = reviewCard(card, good, day(0), { scheduler }).card;
  card = reviewCard(card, good, card.memory.due, { scheduler }).card;
  while (card.tier === 'rotation') {
    const result = reviewCard(card, good, card.memory.due, { scheduler });
    if (result.transition === 'banked') {
      const undone = restoreTier(result.card, result.undo);
      assert.equal(undone.tier, 'rotation');
      assert.equal(undone.bankedAt, null);
      assert.deepEqual(undone.memory, result.card.memory, 'FSRS memory kept');
    }
    card = result.card;
  }

  // Mastering.
  const almost = bankedCard(0, { bankCorrectDays: 2, bankLastCounted: '2026-11-17', bankPrevCounted: '2026-11-09' });
  const result = reviewCard(almost, good, day(30), { scheduler });
  assert.equal(result.transition, 'mastered');
  const undone = restoreTier(result.card, result.undo);
  for (const field of ['tier', 'bankedAt', 'masteredAt', 'bankCorrectDays', 'bankLastCounted', 'bankPrevCounted']) {
    assert.deepEqual(undone[field], almost[field], field);
  }
});

test('a card becomes a leech at 8 lapses and stays flagged', () => {
  let card = { ...rotationCard(5), memory: memory(5, { lapses: 7 }) };
  card = answer(card, again, day(0));
  assert.equal(card.isLeech, false);
  card = answer({ ...card, memory: memory(1, { lapses: 8 }) }, again, day(1));
  assert.equal(card.isLeech, true);
  card = answer({ ...card, memory: memory(20, { lapses: 8 }) }, good, day(30));
  assert.equal(card.isLeech, true);
});

test('manual actions: restore, demote, move to bank, mark as mastered', () => {
  const mastered = bankedCard(0, { tier: 'mastered', masteredAt: day(23), bankCorrectDays: 3 });
  const restored = manualTierChange(mastered, 'restore', day(30));
  assert.equal(restored.tier, 'rotation');
  assert.equal(+restored.memory.due, +day(30), 'due now');
  assert.equal(restored.bankCorrectDays, 3, 'counter kept');
  assert.equal(restored.memory.stability, mastered.memory.stability, 'FSRS kept');

  const demoted = manualTierChange(mastered, 'demote', day(30));
  assert.equal(demoted.tier, 'bank');
  assert.equal(+demoted.bankedAt, +day(30));
  assert.throws(() => manualTierChange(rotationCard(), 'demote', day(30)));

  assert.equal(manualTierChange(rotationCard(2), 'move_to_bank', day(1)).tier, 'bank');
  assert.equal(manualTierChange(rotationCard(2), 'mark_mastered', day(1)).tier, 'mastered');
  assert.throws(() => manualTierChange(rotationCard(), 'explode', day(1)), /Unknown/);
});

test('reviewCard logs before/after values for the review log', () => {
  const card = { ...newTierFields(), memory: newCardMemory() };
  const { log, card: after } = reviewCard(card, good, day(0), { scheduler });
  assert.equal(log.rating, good);
  assert.equal(log.fsrsStateBefore, 'new');
  assert.equal(log.stabilityBefore, null);
  assert.equal(log.stabilityAfter, after.memory.stability);
  assert.equal(log.retrievabilityAtReview, 0);
  assert.equal(+log.dueAfter, +after.memory.due);
  assert.equal(log.tierBefore, 'rotation');
  assert.equal(log.tierAfter, 'rotation');
  assert.equal(log.bankCounterAfter, 0);
});

test('addDays moves across month and year ends', async () => {
  const { addDays } = await import('../src/srs/days.js');
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
