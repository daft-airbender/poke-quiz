import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRound } from '../src/quiz/generateRound.js';
import { weightedSample } from '../src/quiz/random.js';
import { NEW_WEIGHT, weight } from '../src/quiz/weighting.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-10-29T12:00:00Z');
const record = (timesSeen, timesCorrect, streak, daysAgo) => ({ timesSeen, timesCorrect, streak, lastSeenAt: new Date(now - daysAgo * DAY) });

test('never seen gets the new-question weight', () => {
  assert.equal(weight(undefined, now), NEW_WEIGHT);
});

test('a just-missed question outweighs a new one, more so when often missed', () => {
  const missedOnce = weight(record(1, 0, 0, 0), now);
  const usuallyRight = weight(record(10, 9, 0, 0), now);
  assert.ok(usuallyRight > NEW_WEIGHT * 5);
  assert.ok(missedOnce > usuallyRight);
});

test('a correct streak rests the question, doubling the rest each time', () => {
  // Streak 1 rests 1 day, streak 3 rests 4 days.
  assert.ok(weight(record(1, 1, 1, 0.5), now) < NEW_WEIGHT / 10);
  assert.equal(weight(record(1, 1, 1, 1.5), now), NEW_WEIGHT);
  assert.ok(weight(record(3, 3, 3, 3), now) < NEW_WEIGHT / 10);
  assert.equal(weight(record(3, 3, 3, 5), now), NEW_WEIGHT);
});

test('a due question with misses in its history outweighs a perfect one', () => {
  assert.ok(weight(record(4, 2, 1, 10), now) > weight(record(4, 4, 4, 10), now));
});

test('weightedSample returns distinct items and favors heavy ones', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  let heavyPicks = 0;
  for (let run = 0; run < 200; run++) {
    const picked = weightedSample(items, 10, (i) => (i < 5 ? 20 : 1));
    assert.equal(new Set(picked).size, 10);
    heavyPicks += picked.filter((i) => i < 5).length;
  }
  // Uniform sampling would average 0.5 heavy items per draw of 10; weighted gives several.
  assert.ok(heavyPicks / 200 > 3, `average heavy picks ${heavyPicks / 200}`);
});

test('generateRound brings back missed questions and skips resting ones', () => {
  // Gen 1 has 151 name questions. Miss 5 of them; have 100 others resting after a correct answer.
  const progress = new Map();
  for (let id = 1; id <= 5; id++) progress.set(`name:${id}`, record(1, 0, 0, 0));
  for (let id = 50; id < 150; id++) progress.set(`name:${id}`, record(1, 1, 1, 0));

  let missedShown = 0;
  let restingShown = 0;
  for (let run = 0; run < 100; run++) {
    for (const q of generateRound({ modeId: 'name', count: 10, gens: [1], progress, now })) {
      const id = Number(q.questionKey.split(':')[1]);
      if (id <= 5) missedShown++;
      else if (id >= 50 && id < 150) restingShown++;
    }
  }
  assert.ok(missedShown / 100 > 2.5, `missed per round ${missedShown / 100}`);
  assert.ok(restingShown / 100 < 1, `resting per round ${restingShown / 100}`);
});

test('generateRound still fills a round when everything is resting', () => {
  const progress = new Map();
  for (let id = 1; id <= 151; id++) progress.set(`type:${id}`, record(5, 5, 5, 0));
  assert.equal(generateRound({ modeId: 'type', count: 30, gens: [1], progress, now }).length, 30);
});
