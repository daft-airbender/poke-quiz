import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../src/srs/catalog.js';
import { replayCard } from '../src/srs/replay.js';
import { reviewCard } from '../src/srs/review.js';
import { cardFromRow, rowFromCard } from '../src/srs/rows.js';
import { createScheduler, newCardMemory, RATING } from '../src/srs/scheduler.js';
import { manualTierChange, newTierFields, restoreTier } from '../src/srs/tiers.js';
import { listModes } from '../src/quiz/modes/index.js';

const scheduler = createScheduler();
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Simulates one card's life the way the app will record it: answers (mostly on time, sometimes early,
// late, or as same-day repeats), the occasional manual action, and undos of "Banked!" / "Mastered!".
// Returns the live card plus the rows review_log and card_events would hold.
function simulate(seed, steps = 120) {
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let now = new Date('2026-11-01T15:00:00Z');
  let card = { ...newTierFields(), memory: newCardMemory() };
  const reviews = [];
  const events = [];
  const seen = { banked: 0, mastered: 0, undo: 0, manual: 0, freePlay: 0 };

  for (let i = 0; i < steps; i++) {
    const roll = random();
    if (roll < 0.03 && card.memory.state !== 'new') {
      const action = card.tier === 'mastered' && random() < 0.5 ? 'demote' : ['restore', 'move_to_bank', 'mark_mastered'][Math.floor(random() * 3)];
      const before = card.tier;
      card = manualTierChange(card, action, now);
      events.push({ at: now, action, tierBefore: before, tierAfter: card.tier, undoTo: null });
      seen.manual++;
    } else if (roll < 0.06) {
      // Free Play: logged, never changes the card.
      reviews.push({ reviewedAt: now, rating: random() < 0.8 ? 3 : 1, mode: 'free_play' });
      seen.freePlay++;
    } else {
      const rating = random() < 0.85 ? (random() < 0.7 ? RATING.good : random() < 0.5 ? RATING.easy : RATING.hard) : RATING.again;
      const result = reviewCard(card, rating, now, { scheduler });
      reviews.push({ reviewedAt: now, rating, mode: 'due' });
      card = result.card;
      if (result.transition === 'banked') seen.banked++;
      if (result.transition === 'mastered') seen.mastered++;
      if (result.transition && random() < 0.25) {
        // Undo, stored as JSON in card_events.undo_to.
        const undoAt = new Date(+now + 2000);
        events.push({ at: undoAt, action: 'undo', tierBefore: card.tier, tierAfter: result.undo.tier, undoTo: JSON.parse(JSON.stringify(result.undo)) });
        card = restoreTier(card, result.undo);
        seen.undo++;
      }
    }
    // Next time: usually when due (or a bit late), sometimes minutes later (a binge repeat).
    const due = card.memory.due ?? now;
    const r = random();
    now = r < 0.15 ? new Date(+now + random() * 30 * MINUTE) : new Date(Math.max(+now + MINUTE, +due + (random() - 0.3) * 3 * DAY));
  }
  return { card, reviews, events, seen };
}

test('replaying review_log + card_events reproduces every card exactly', () => {
  const totals = { banked: 0, mastered: 0, undo: 0, manual: 0, freePlay: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const { card, reviews, events, seen } = simulate(seed);
    for (const key of Object.keys(totals)) totals[key] += seen[key];
    assert.deepEqual(replayCard({ reviews, events }, { scheduler }), card, `seed ${seed}`);
  }
  // Make sure the histories actually exercised the interesting paths.
  for (const [key, count] of Object.entries(totals)) assert.ok(count > 0, `no ${key} in any simulated history`);
});

test('Free Play answers never change a card, and an untouched card replays as unseen', () => {
  const freePlayOnly = [
    { reviewedAt: new Date('2026-11-01T15:00:00Z'), rating: 1, mode: 'free_play' },
    { reviewedAt: new Date('2026-11-02T15:00:00Z'), rating: 3, mode: 'free_play' },
  ];
  assert.equal(replayCard({ reviews: freePlayOnly, events: [] }, { scheduler }), null);
  assert.equal(replayCard({ reviews: [], events: [] }, { scheduler }), null);
});

test('card_state rows round-trip without losing anything', () => {
  const { card } = simulate(3);
  assert.deepEqual(cardFromRow(rowFromCard(card)), card);
});

test('the catalog has one card per mode question, with a payload and stable keys', () => {
  const catalog = buildCatalog();
  assert.equal(catalog.length, 10101);
  assert.equal(new Set(catalog.map((c) => c.promptKey)).size, catalog.length, 'keys are unique');
  assert.deepEqual([...new Set(catalog.map((c) => c.cardType))], listModes().map((m) => m.id));
  assert.ok(catalog.every((c) => c.payload?.title && c.promptKey.startsWith(`${c.cardType}:`)));
  const fireVsGrassSteel = catalog.find((c) => c.promptKey === 'effectiveness-dual:fire>grass/steel');
  assert.equal(fireVsGrassSteel.generation, null);
  assert.equal(fireVsGrassSteel.payload.answer, '4×');
  const pikachu = catalog.find((c) => c.promptKey === 'name-choice:25');
  assert.deepEqual([pikachu.generation, pikachu.sortOrder, pikachu.payload.title], [1, 24, 'Pikachu']);
});

test('a never-answered card moved to the bank by hand replays exactly', () => {
  const at = new Date('2026-11-01T15:00:00Z');
  const live = manualTierChange({ ...newTierFields(), memory: newCardMemory() }, 'move_to_bank', at);
  assert.deepEqual(replayCard({ reviews: [], events: [{ at, action: 'move_to_bank', undoTo: null }] }, { scheduler }), live);
  // ...and then answered in a check-in.
  const answered = reviewCard(live, RATING.good, new Date('2026-12-20T15:00:00Z'), { scheduler }).card;
  const reviews = [{ reviewedAt: new Date('2026-12-20T15:00:00Z'), rating: RATING.good, mode: 'bank_checkin' }];
  assert.deepEqual(replayCard({ reviews, events: [{ at, action: 'move_to_bank', undoTo: null }] }, { scheduler }), answered);
});
