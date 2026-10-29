import { test } from 'node:test';
import assert from 'node:assert/strict';
import chart from '../data/type-chart.json' with { type: 'json' };
import { TYPES, multiplier } from '../src/quiz/typeEffectiveness.js';

test('chart is 18×18 with only valid multipliers', () => {
  assert.equal(TYPES.length, 18);
  assert.equal(chart.matrix.length, 18);
  for (const row of chart.matrix) {
    assert.equal(row.length, 18);
    for (const value of row) assert.ok([0, 0.5, 1, 2].includes(value), `bad value ${value}`);
  }
});

// The Gen 6+ chart has 51 super-effective, 61 not-very-effective, and 8 no-effect pairs.
// Catches a mistyped cell that the spot checks below might miss.
test('chart has the expected number of each multiplier', () => {
  const counts = { 0: 0, 0.5: 0, 2: 0 };
  for (const row of chart.matrix) {
    for (const value of row) if (value in counts) counts[value]++;
  }
  assert.deepEqual(counts, { 0: 8, 0.5: 61, 2: 51 });
});

test('all eight immunities', () => {
  assert.equal(multiplier('normal', ['ghost']), 0);
  assert.equal(multiplier('fighting', ['ghost']), 0);
  assert.equal(multiplier('ghost', ['normal']), 0);
  assert.equal(multiplier('electric', ['ground']), 0);
  assert.equal(multiplier('ground', ['flying']), 0);
  assert.equal(multiplier('poison', ['steel']), 0);
  assert.equal(multiplier('psychic', ['dark']), 0);
  assert.equal(multiplier('dragon', ['fairy']), 0);
});

test('single-type matchups', () => {
  assert.equal(multiplier('fire', ['grass']), 2);
  assert.equal(multiplier('water', ['fire']), 2);
  assert.equal(multiplier('fire', ['water']), 0.5);
  assert.equal(multiplier('fairy', ['dragon']), 2);
  assert.equal(multiplier('steel', ['fairy']), 2);
  assert.equal(multiplier('normal', ['normal']), 1);
});

test('dual-type matchups multiply', () => {
  assert.equal(multiplier('ground', ['electric', 'flying']), 0); // immunity wins
  assert.equal(multiplier('ice', ['grass', 'flying']), 4);
  assert.equal(multiplier('fire', ['grass', 'steel']), 4);
  assert.equal(multiplier('fire', ['water', 'rock']), 0.25);
  assert.equal(multiplier('grass', ['water', 'ground']), 4);
  assert.equal(multiplier('electric', ['water', 'flying']), 4);
  assert.equal(multiplier('fighting', ['normal', 'flying']), 1); // 2 × 0.5
  assert.equal(multiplier('bug', ['fire', 'flying']), 0.25);
});

test('defender type order does not matter', () => {
  assert.equal(multiplier('fire', ['steel', 'grass']), multiplier('fire', ['grass', 'steel']));
});

test('unknown types throw', () => {
  assert.throws(() => multiplier('sound', ['normal']), /Unknown type/);
  assert.throws(() => multiplier('fire', ['shadow']), /Unknown type/);
});
