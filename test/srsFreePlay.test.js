import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accuracyByType, shownThisPass } from '../src/srs/freePlay.js';

test('no repeats until every card in the filter has been shown, then a fresh pass', () => {
  assert.deepEqual([...shownThisPass([], 3)], []);
  assert.deepEqual([...shownThisPass([1, 2], 3)], [1, 2]);
  assert.deepEqual([...shownThisPass([1, 2, 3], 3)], [], 'pass complete: everything is available again');
  assert.deepEqual([...shownThisPass([1, 2, 3, 2], 3)], [2], 'second pass under way');
  assert.deepEqual([...shownThisPass([1, 2, 3, 2, 3, 1, 3], 3)], [3], 'third pass');
});

test('accuracy per card type, in the order first seen', () => {
  const answers = [
    { cardType: 'type', correct: true },
    { cardType: 'name-text', correct: false },
    { cardType: 'type', correct: false },
    { cardType: 'type', correct: true },
  ];
  assert.deepEqual(accuracyByType(answers), [
    { cardType: 'type', answered: 3, correct: 2 },
    { cardType: 'name-text', answered: 1, correct: 0 },
  ]);
});
