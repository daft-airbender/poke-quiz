import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SRS_CONFIG } from '../src/srs/config.js';
import { inCooldown, inPlayScope, newCardsLeft, orderNewCards, pickNextCard, pickPracticeCard } from '../src/srs/queue.js';
import { createScheduler, newCardMemory } from '../src/srs/scheduler.js';
import { newTierFields } from '../src/srs/tiers.js';

const scheduler = createScheduler();
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const NOW = new Date('2026-11-20T17:00:00Z');
const ago = (ms) => new Date(NOW - ms);

// A studied card. stability and lastReviewDaysAgo set its R; due set relative to now.
function card(id, { tier = 'rotation', state = 'review', stability = 10, lastReviewDaysAgo = 5, dueInMs = 1, cardType = 'type' } = {}) {
  return {
    ...newTierFields(),
    id,
    cardType,
    tier,
    memory: {
      ...newCardMemory(),
      state,
      stability,
      difficulty: 5,
      reps: 3,
      lastReviewAt: ago(lastReviewDaysAgo * DAY),
      due: new Date(+NOW + dueInMs),
    },
  };
}
const unseen = (id, cardType = 'type', generation = 1, order = id) => ({ id, cardType, generation, order });
const pick = (studied, { newCards = [], recent = [], newToday = { introducedToday: 0 } } = {}) =>
  pickNextCard({ studied, newCards, recent, now: NOW, scheduler, newToday });

test('tier order: due learning step, then due review / check-in, then new, then ahead', () => {
  const step = card('step', { state: 'learning', stability: 1, lastReviewDaysAgo: 0.01, dueInMs: -MINUTE });
  const due = card('due', { dueInMs: -DAY });
  const ahead = card('ahead', { dueInMs: 5 * DAY });
  const newOne = unseen('new');
  const studied = [ahead, due, step];

  assert.deepEqual(pick(studied, { newCards: [newOne] }), { card: step, mode: 'due' });
  assert.deepEqual(pick([ahead, due], { newCards: [newOne] }), { card: due, mode: 'due' });
  assert.deepEqual(pick([ahead], { newCards: [newOne] }), { card: newOne, mode: 'new' });
  assert.deepEqual(pick([ahead]), { card: ahead, mode: 'ahead' });
});

test('within a tier, lowest retrievability first', () => {
  const weak = card('weak', { stability: 2, lastReviewDaysAgo: 10, dueInMs: -DAY });
  const strong = card('strong', { stability: 50, lastReviewDaysAgo: 10, dueInMs: -DAY });
  assert.equal(pick([strong, weak]).card.id, 'weak');
  const aheadWeak = card('aw', { stability: 3, lastReviewDaysAgo: 2, dueInMs: DAY });
  const aheadStrong = card('as', { stability: 80, lastReviewDaysAgo: 2, dueInMs: 30 * DAY });
  assert.equal(pick([aheadStrong, aheadWeak]).card.id, 'aw', 'keep playing: weakest first');
});

test('banked cards only appear as check-ins once R drops below 0.80; mastered cards never appear', () => {
  const freshBank = card('bank-fresh', { tier: 'bank', stability: 60, lastReviewDaysAgo: 5, dueInMs: -DAY });
  const fadingBank = card('bank-fading', { tier: 'bank', stability: 30, lastReviewDaysAgo: 120 });
  const mastered = card('mastered', { tier: 'mastered', stability: 30, lastReviewDaysAgo: 400, dueInMs: -100 * DAY });
  assert.ok(scheduler.retrievability(fadingBank.memory, NOW) < 0.8);
  assert.ok(scheduler.retrievability(freshBank.memory, NOW) > 0.8);

  assert.deepEqual(pick([freshBank, fadingBank, mastered]), { card: fadingBank, mode: 'bank_checkin' });
  // Without a check-in due, banked and mastered cards don't fill "keep playing".
  const result = pick([freshBank, mastered]);
  assert.equal(result.card, null);
  assert.equal(result.canPracticeBank, true);
  for (let i = 0; i < 20; i++) assert.notEqual(pick([mastered, card(`r${i}`)]).card.id, 'mastered');
});

test('the repeat cooldown skips a card shown within the last 8 cards and 3 minutes, but not a due learning step', () => {
  const due = card('due', { dueInMs: -DAY, stability: 2, lastReviewDaysAgo: 9 });
  const other = card('other', { dueInMs: 3 * DAY });
  const justShown = [{ cardId: 'due', at: ago(30_000) }];
  assert.equal(pick([due, other], { recent: justShown }).card.id, 'other');

  // Ends after 8 other cards...
  const eightLater = [...justShown, ...Array.from({ length: 8 }, (_, i) => ({ cardId: `x${i}`, at: ago(20_000) }))];
  assert.equal(pick([due, other], { recent: eightLater }).card.id, 'due');
  // ...or after 3 minutes, whichever comes first.
  assert.equal(pick([due, other], { recent: [{ cardId: 'due', at: ago(3 * MINUTE) }] }).card.id, 'due');

  // A due learning step comes back even if it was just shown.
  const step = card('step', { state: 'relearning', stability: 1, lastReviewDaysAgo: 0.01, dueInMs: -1000 });
  assert.equal(pick([step, other], { recent: [{ cardId: 'step', at: ago(61_000) }] }).card.id, 'step');

  assert.equal(inCooldown('nope', justShown, NOW), false, 'never shown: no cooldown');
});

test('the queue never comes back empty while studied rotation cards exist', () => {
  const only = card('only', { dueInMs: 5 * DAY });
  const result = pick([only], { recent: [{ cardId: 'only', at: ago(1000) }] });
  assert.equal(result.card.id, 'only', 'cooldown gives way when it is the only thing left');

  const a = card('a', { dueInMs: DAY });
  const b = card('b', { dueInMs: DAY });
  const recent = [
    { cardId: 'a', at: ago(20_000) },
    { cardId: 'b', at: ago(10_000) },
  ];
  assert.equal(pick([a, b], { recent }).card.id, 'a', 'the one shown longest ago');
});

test('daily new-card limit, with "add more" going past it', () => {
  const ahead = card('ahead', { dueInMs: DAY });
  const newOne = unseen('new');
  assert.equal(newCardsLeft({ introducedToday: 0 }), 20);
  assert.equal(newCardsLeft({ introducedToday: 20 }), 0);
  assert.equal(newCardsLeft({ introducedToday: 20, extraToday: 10 }), 10);
  assert.equal(newCardsLeft({ introducedToday: 35, extraToday: 10 }), 0);

  assert.equal(pick([ahead], { newCards: [newOne], newToday: { introducedToday: 20 } }).card.id, 'ahead', 'limit reached');
  assert.equal(pick([ahead], { newCards: [newOne], newToday: { introducedToday: 20, extraToday: 10 } }).card.id, 'new');
  const nothing = pick([], { newCards: [newOne], newToday: { introducedToday: 20 } });
  assert.deepEqual(nothing, { card: null, canAddNew: true, canPracticeBank: false });
});

test('Play scope: which modes and generations new cards come from', () => {
  const scope = { modes: ['name-choice', 'type'], gens: [1] };
  assert.equal(inPlayScope({ cardType: 'type', generation: 1 }, scope), true);
  assert.equal(inPlayScope({ cardType: 'type', generation: 2 }, scope), false);
  assert.equal(inPlayScope({ cardType: 'mon-to-dex', generation: 1 }, scope), false);
  assert.equal(inPlayScope({ cardType: 'effectiveness-single', generation: null }, { modes: null, gens: [1] }), true, 'no generation: mode decides');
  assert.equal(inPlayScope({ cardType: 'anything', generation: 9 }, { modes: null, gens: null }), true, 'null = everything');
});

test('new cards take turns between card types, each in generation then catalog order', () => {
  const cards = [
    unseen('t2', 'type', 1, 2),
    unseen('t1', 'type', 1, 1),
    unseen('t152', 'type', 2, 152),
    unseen('n1', 'name-choice', 1, 1),
    unseen('n2', 'name-choice', 1, 2),
    unseen('e1', 'effectiveness-single', null, 1),
  ];
  const order = ['name-choice', 'type', 'effectiveness-single'];
  assert.deepEqual(orderNewCards(cards, {}, order).map((c) => c.id), ['n1', 't1', 'e1', 'n2', 't2', 't152']);
  // A type that's behind catches up first.
  assert.deepEqual(orderNewCards(cards, { 'name-choice': 5, type: 5 }, order).map((c) => c.id).slice(0, 2), ['e1', 'n1']);
});

test('practice sessions draw only from their tier, lowest R first', () => {
  const bankWeak = card('bw', { tier: 'bank', stability: 30, lastReviewDaysAgo: 60 });
  const bankStrong = card('bs', { tier: 'bank', stability: 300, lastReviewDaysAgo: 60 });
  const mastered = card('m', { tier: 'mastered', stability: 30, lastReviewDaysAgo: 300 });
  const rotation = card('r', { stability: 1, lastReviewDaysAgo: 300 });
  const studied = [bankStrong, rotation, mastered, bankWeak];
  const practice = (tier, recent = []) => pickPracticeCard({ studied, tier, recent, now: NOW, scheduler });
  assert.deepEqual(practice('bank'), { card: bankWeak, mode: 'bank_practice' });
  assert.deepEqual(practice('mastered'), { card: mastered, mode: 'mastered_practice' });
  assert.equal(practice('bank', [{ cardId: 'bw', at: ago(1000) }]).card.id, 'bs', 'cooldown');
  assert.deepEqual(pickPracticeCard({ studied: [rotation], tier: 'bank', recent: [], now: NOW, scheduler }), { card: null });
  assert.equal(SRS_CONFIG.repeatCooldown.cards, 8);
});
