import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';
import { SRS_CONFIG } from '../src/srs/config.js';
import { createScheduler, newCardMemory, RATING } from '../src/srs/scheduler.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const T0 = new Date('2026-11-01T15:00:00Z');
const later = (date, ms) => new Date(date.getTime() + ms);

const scheduler = createScheduler();

// A card that has been answered Good on time several times: stability of a few months.
function establishedCard() {
  let card = scheduler.answer(newCardMemory(), RATING.good, T0);
  for (let i = 0; i < 4; i++) card = scheduler.answer(card, RATING.good, card.due);
  return card;
}

test('a new card rated Good goes through the learning steps, then becomes a review card', () => {
  const first = scheduler.answer(newCardMemory(), RATING.good, T0);
  assert.equal(first.state, 'learning');
  assert.equal(first.due - T0, 10 * MINUTE, 'Good on a new card: the 10-minute step');
  assert.equal(first.reps, 1);

  const second = scheduler.answer(first, RATING.good, first.due);
  assert.equal(second.state, 'review');
  assert.ok(second.due - first.due >= DAY, 'graduated: due a day or more later');
  assert.ok(second.stability > 0 && second.difficulty >= 1 && second.difficulty <= 10);

  const again = scheduler.answer(newCardMemory(), RATING.again, T0);
  assert.equal(again.state, 'learning');
  assert.equal(again.due - T0, MINUTE, 'Again on a new card: the 1-minute step');
});

test('Again on a review card lowers stability, adds a lapse, and brings it back within minutes', () => {
  const card = establishedCard();
  assert.equal(card.state, 'review');
  const missed = scheduler.answer(card, RATING.again, card.due);
  assert.equal(missed.state, 'relearning');
  assert.ok(missed.stability < card.stability / 5);
  assert.equal(missed.lapses, card.lapses + 1);
  assert.equal(missed.due - card.due, 10 * MINUTE, 'the 10-minute relearning step');

  // Missing it minutes after a correct answer still sends it back to relearning.
  const soon = scheduler.answer(card, RATING.again, later(card.lastReviewAt, 5 * MINUTE));
  assert.equal(soon.state, 'relearning');
  assert.ok(soon.stability < card.stability);
  assert.equal(soon.lapses, card.lapses + 1);
});

// The core binge-proof property: repeating a card right away barely counts; remembering it after a gap counts a lot.
test('Good minutes or hours after the last answer raises stability far less than Good after a long gap', () => {
  const card = establishedCard();
  const gain = (ms) => scheduler.answer(card, RATING.good, later(card.lastReviewAt, ms)).stability - card.stability;
  const atDue = gain(card.due - card.lastReviewAt);
  assert.ok(atDue > card.stability, 'on time: stability more than doubles');
  for (const ms of [5 * MINUTE, 60 * MINUTE, 6 * 60 * MINUTE]) {
    assert.ok(gain(ms) <= atDue * 0.01, `after ${ms / MINUTE} min: gain ${gain(ms)} vs ${atDue} on time`);
  }
  assert.ok(gain(DAY) < atDue * 0.05, 'a day later: still small');
  assert.ok(gain((card.due - card.lastReviewAt) * 1.5) > atDue, 'overdue and still remembered: counts even more');
});

test('retrievability starts at 1, falls over time, and is about the desired retention when due', () => {
  const card = establishedCard();
  const r = (ms) => scheduler.retrievability(card, later(card.lastReviewAt, ms));
  assert.equal(r(0), 1);
  const days = [1, 7, 30, 90, 365].map((d) => r(d * DAY));
  for (let i = 1; i < days.length; i++) assert.ok(days[i] < days[i - 1], `R falls: ${days}`);
  assert.ok(Math.abs(r(card.due - card.lastReviewAt) - SRS_CONFIG.fsrs.desiredRetention) < 0.02);
  assert.equal(scheduler.retrievability(newCardMemory(), T0), 0, 'never answered: nothing to recall yet');
});

test('preview gives a due date per rating, in order, matching what answering would do', () => {
  const card = establishedCard();
  const now = card.due;
  const preview = scheduler.preview(card, now);
  assert.deepEqual(Object.keys(preview).map(Number), [1, 2, 3, 4]);
  assert.ok(preview[1] <= preview[2] && preview[2] <= preview[3] && preview[3] <= preview[4]);
  for (const rating of [1, 2, 3, 4]) {
    assert.equal(+preview[rating], +scheduler.answer(card, rating, now).due, `rating ${rating}`);
  }
});

test('fuzz is deterministic for the same history, and spreads out cards learned together', () => {
  // Same history -> same due dates (so replaying review_log reproduces card_state).
  const run = () => establishedCard().due;
  assert.equal(+run(), +run());

  // An injected seed changes the fuzz.
  const seeded = (seed) => {
    const s = createScheduler(SRS_CONFIG.fsrs, { seed: () => seed });
    let card = s.answer(newCardMemory(), RATING.good, T0);
    for (let i = 0; i < 3; i++) card = s.answer(card, RATING.good, card.due);
    return +card.due;
  };
  assert.equal(seeded('a'), seeded('a'));
  assert.ok(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(seeded)).size > 1, 'different seeds, different dues');

  // 30 cards learned a few seconds apart: with fuzz they come due on different days; without, the same day.
  const dueDays = (config) => {
    const s = createScheduler(config);
    const days = new Set();
    for (let i = 0; i < 30; i++) {
      let card = s.answer(newCardMemory(), RATING.good, later(T0, i * 5000));
      for (let k = 0; k < 2; k++) card = s.answer(card, RATING.good, card.due);
      days.add(Math.floor(card.due / DAY));
    }
    return days.size;
  };
  assert.ok(dueDays(SRS_CONFIG.fsrs) > 3, 'fuzz spreads due dates');
  assert.equal(dueDays({ ...SRS_CONFIG.fsrs, fuzz: false }), 1, 'no fuzz: all due the same day');
});

test('answer is pure and rejects ratings outside 1-4', () => {
  const card = Object.freeze(establishedCard());
  const snapshot = structuredClone(card);
  scheduler.answer(card, RATING.good, card.due);
  scheduler.preview(card, card.due);
  assert.deepEqual(card, snapshot);
  for (const bad of [0, 5, 2.5, '3', undefined]) {
    assert.throws(() => scheduler.answer(card, bad, card.due), /rating/);
  }
});

// The wrapper converts to and from ts-fsrs cards on every answer; it must not lose anything.
test('the wrapper matches ts-fsrs exactly over a long random history', () => {
  const library = fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: 36500,
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
      enable_fuzz: true,
    }),
  );
  let raw = createEmptyCard(T0);
  let ours = newCardMemory();
  let now = T0;
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 300; i++) {
    const rating = 1 + Math.floor(random() * 4);
    raw = library.next(raw, now, rating).card;
    ours = scheduler.answer(ours, rating, now);
    assert.equal(+ours.due, +raw.due, `answer ${i}`);
    assert.equal(ours.stability, raw.stability, `answer ${i}`);
    assert.equal(ours.difficulty, raw.difficulty, `answer ${i}`);
    assert.equal([ours.reps, ours.lapses, ours.learningStep].join(), [raw.reps, raw.lapses, raw.learning_steps].join());
    now = later(now, random() * 20 * DAY);
  }
});
