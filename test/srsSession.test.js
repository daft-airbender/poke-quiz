import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstAttempts, lengthToUse, limitReached, nextStep, parseSessionLength, progressLabel, summarize, wrapUpCards } from '../src/srs/session.js';

const MINUTE = 60 * 1000;
const START = new Date('2026-11-20T17:00:00Z');
const at = (ms) => new Date(+START + ms);

function session(length, answers = [], extra = {}) {
  return { length, startedAt: START, answers, endRequested: false, ...extra };
}
// n answers to distinct cards, all correct unless listed in `wrong`.
const answers = (n, wrong = []) =>
  Array.from({ length: n }, (_, i) => ({ cardId: `c${i}`, correct: !wrong.includes(i), at: at(i * 10_000), isWrapup: false }));

test('session lengths: valid values only, and the last one used becomes the default', () => {
  assert.deepEqual(parseSessionLength({ type: 'count', value: 25 }), { type: 'count', value: 25 });
  assert.deepEqual(parseSessionLength({ type: 'timer', value: 10 }), { type: 'timer', value: 10 });
  assert.deepEqual(parseSessionLength({ type: 'endless', value: 99 }), { type: 'endless' });
  for (const bad of [{ type: 'count', value: 30 }, { type: 'timer', value: 25 }, { type: 'forever' }, null]) {
    assert.equal(parseSessionLength(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(lengthToUse(undefined), { type: 'count', value: 25 }, 'first-ever default');
  assert.deepEqual(lengthToUse({ type: 'timer', value: 5 }), { type: 'timer', value: 5 }, 'last used');
  assert.deepEqual(lengthToUse({ type: 'count', value: 7 }), { type: 'count', value: 25 }, 'invalid stored value falls back');
});

test('a 10-question session ends after 10 answers plus any wrap-up questions', () => {
  const ten = { type: 'count', value: 10 };
  assert.deepEqual(nextStep(session(ten, answers(9)), at(MINUTE)), { step: 'question' });
  assert.equal(limitReached(session(ten, answers(10)), at(MINUTE)), true);
  assert.deepEqual(nextStep(session(ten, answers(10)), at(MINUTE)), { step: 'done' }, 'no misses: done');

  // Card c3 was missed: one wrap-up, which goes past the limit, then done.
  const missed = answers(10, [3]);
  assert.deepEqual(nextStep(session(ten, missed), at(MINUTE)), { step: 'wrapup', cardId: 'c3', waitMs: 0 });
  const wrapped = [...missed, { cardId: 'c3', correct: true, at: at(2 * MINUTE), isWrapup: true }];
  assert.equal(limitReached(session(ten, wrapped), at(MINUTE)), true);
  assert.deepEqual(nextStep(session(ten, wrapped), at(MINUTE)), { step: 'done' });
});

test('repeats count toward the question limit', () => {
  const repeats = [0, 1, 2].map((i) => ({ cardId: 'same', correct: true, at: at(i), isWrapup: false }));
  assert.equal(limitReached(session({ type: 'count', value: 10 }, [...repeats, ...answers(7)]), at(0)), true);
});

test('each missed card gets exactly one wrap-up showing; one answered correctly later gets none', () => {
  const list = [
    { cardId: 'a', correct: false, at: at(0), isWrapup: false },
    { cardId: 'b', correct: false, at: at(1), isWrapup: false },
    { cardId: 'b', correct: true, at: at(2), isWrapup: false }, // fixed later in the session
    { cardId: 'c', correct: true, at: at(3), isWrapup: false },
  ];
  assert.deepEqual(wrapUpCards(session({ type: 'endless' }, list)), ['a']);
  // Missed again in its wrap-up: no second wrap-up (it stays in relearning for next time).
  const again = [...list, { cardId: 'a', correct: false, at: at(4), isWrapup: true }];
  assert.deepEqual(wrapUpCards(session({ type: 'endless' }, again)), []);
});

test('a timer session finishes the current question when time runs out, then does wrap-up', () => {
  const five = { type: 'timer', value: 5 };
  const started = answers(20, [4]);
  assert.deepEqual(nextStep(session(five, started), at(4 * MINUTE)), { step: 'question' }, 'time left');
  // The question shown at 4:59 was answered at 5:20: it still counts, then wrap-up.
  const late = [...started, { cardId: 'last', correct: true, at: at(5 * MINUTE + 20_000), isWrapup: false }];
  assert.deepEqual(nextStep(session(five, late), at(5 * MINUTE + 20_000)), { step: 'wrapup', cardId: 'c4', waitMs: 0 });
  assert.equal(late.filter((a) => !a.isWrapup).length, 21);
});

test('wrap-up respects the cooldown: a card just shown goes after the others, or waits briefly if alone', () => {
  const ten = { type: 'count', value: 3 };
  const list = [
    { cardId: 'x', correct: false, at: at(0), isWrapup: false },
    { cardId: 'y', correct: true, at: at(1), isWrapup: false },
    { cardId: 'z', correct: false, at: at(2), isWrapup: false },
  ];
  assert.deepEqual(nextStep(session(ten, list), at(3)), { step: 'wrapup', cardId: 'x', waitMs: 0 }, 'z was just shown');
  const xDone = [...list, { cardId: 'x', correct: true, at: at(4), isWrapup: true }];
  assert.deepEqual(nextStep(session(ten, xDone), at(5)), { step: 'wrapup', cardId: 'z', waitMs: 0 });
  const zLast = [list[0], list[1], { cardId: 'x', correct: true, at: at(3), isWrapup: true }, list[2]];
  // Only z is left and it was just shown: brief wait.
  assert.deepEqual(nextStep(session({ type: 'count', value: 3 }, zLast), at(4)), { step: 'wrapup', cardId: 'z', waitMs: 5000 });
});

test('Endless only ends on request; "Review N missed cards" runs the wrap-up first', () => {
  const endless = { type: 'endless' };
  const list = answers(500, [7, 9]);
  assert.deepEqual(nextStep(session(endless, list), at(600 * MINUTE)), { step: 'question' });
  assert.equal(nextStep(session(endless, list, { endRequested: true }), at(0)).step, 'wrapup');
  assert.equal(wrapUpCards(session(endless, list)).length, 2, '"Review 2 missed cards"');
});

test('progress labels for count, timer and endless sessions', () => {
  assert.equal(progressLabel(session({ type: 'count', value: 25 }, answers(12)), at(0)), '12 / 25');
  assert.equal(progressLabel(session({ type: 'timer', value: 5 }), at(79_000)), '3:41 left');
  assert.equal(progressLabel(session({ type: 'timer', value: 5 }), at(9 * MINUTE)), "Time's up");
  const thirtySeven = answers(37, [1, 2, 3, 4]);
  assert.equal(progressLabel(session({ type: 'endless' }, thirtySeven), at(0)), '37 answered · 89%');
});

test('summary: answered, % correct, new cards learned, tier moves, misses', () => {
  const list = [
    { cardId: 'n1', correct: true, mode: 'new', tierBefore: 'rotation', tierAfter: 'rotation' },
    { cardId: 'n1', correct: false, mode: 'due', tierBefore: 'rotation', tierAfter: 'rotation' },
    { cardId: 'n1', correct: true, mode: 'due', tierBefore: 'rotation', tierAfter: 'rotation' },
    { cardId: 'b1', correct: true, mode: 'due', tierBefore: 'rotation', tierAfter: 'bank' },
    { cardId: 'b2', correct: true, mode: 'due', tierBefore: 'rotation', tierAfter: 'bank', undone: true },
    { cardId: 'm1', correct: true, mode: 'bank_checkin', tierBefore: 'bank', tierAfter: 'mastered' },
    { cardId: 'x1', correct: false, mode: 'bank_checkin', tierBefore: 'bank', tierAfter: 'rotation' },
  ];
  const summary = summarize(list);
  assert.equal(summary.answered, 5, 'n1 scores once');
  assert.equal(summary.percentCorrect, 80);
  assert.equal(summary.newLearned, 1);
  assert.deepEqual(summary.banked, ['b1'], 'undone banking not listed');
  assert.deepEqual(summary.mastered, ['m1']);
  assert.deepEqual(summary.backToRotation, ['x1']);
  assert.deepEqual(summary.missed, ['n1', 'x1']);
  assert.deepEqual(summary.stillMissed, ['x1']);
});

test('the score counts first attempts only: 10 questions with 3 wrong is 70%, however the wrap-up goes', () => {
  const first = Array.from({ length: 10 }, (_, i) => ({ cardId: `c${i}`, correct: i >= 3, mode: 'due', isWrapup: false, tierBefore: 'rotation', tierAfter: 'rotation' }));
  const review = (i, correct) => ({ cardId: `c${i}`, correct, mode: 'wrapup', isWrapup: true, tierBefore: 'rotation', tierAfter: 'rotation' });
  const score = (answers) => {
    const { answered, correct, percentCorrect } = summarize(answers);
    return { answered, correct, percentCorrect };
  };
  const expected = { answered: 10, correct: 7, percentCorrect: 70 };
  assert.deepEqual(score(first), expected, 'before the review');
  assert.deepEqual(score([...first, review(0, true), review(1, true), review(2, true)]), expected, 'all right in the review');
  assert.deepEqual(score([...first, review(0, false), review(1, false), review(2, false)]), expected, 'all wrong in the review');
  // What the summary still reports about the review.
  const summary = summarize([...first, review(0, true), review(1, false), review(2, true)]);
  assert.deepEqual(summary.missed, ['c0', 'c1', 'c2']);
  assert.deepEqual(summary.stillMissed, ['c1']);
});

test('a repeat of a card in the same round never scores: only the first answer does', () => {
  const list = [
    { cardId: 'a', correct: false, isWrapup: false },
    { cardId: 'b', correct: true, isWrapup: false },
    { cardId: 'a', correct: true, isWrapup: false }, // right the second time: still a miss
    { cardId: 'b', correct: false, isWrapup: false }, // wrong the second time: still right
    { cardId: 'a', correct: true, isWrapup: true },
  ];
  assert.deepEqual(firstAttempts(list).map((a) => a.cardId), ['a', 'b']);
  assert.equal(summarize(list).answered, 2);
  assert.equal(summarize(list).correct, 1);
  assert.equal(summarize(list).percentCorrect, 50);
  // Repeats still use up the question limit (the summary's number is what scores).
  assert.equal(limitReached(session({ type: 'count', value: 4 } , list.slice(0, 4).map((a) => ({ ...a, at: at(0) }))), at(0)), true);
  assert.equal(progressLabel(session({ type: 'endless' }, list), at(0)), '2 answered · 50%');
});

test('an all-wrap-up list scores zero rather than dividing by zero', () => {
  assert.equal(summarize([]).percentCorrect, 0);
  assert.equal(summarize([{ cardId: 'a', correct: true, isWrapup: true }]).percentCorrect, 0);
});

test('a round with no misses goes straight to done, for a question limit and for a timer', () => {
  assert.deepEqual(nextStep(session({ type: 'count', value: 10 }, answers(10)), at(MINUTE)), { step: 'done' });
  assert.deepEqual(nextStep(session({ type: 'timer', value: 5 }, answers(20)), at(5 * MINUTE)), { step: 'done' });
});

test('the timer running out mid-question: that answer counts, and only then does the round end', () => {
  const five = { type: 'timer', value: 5 };
  const before = answers(3);
  const afterTime = at(5 * MINUTE + 20_000);
  // Wrong on the question that was on screen when time ran out: it's scored, and it's the one to review.
  const missed = [...before, { cardId: 'last', correct: false, at: afterTime, isWrapup: false }];
  assert.deepEqual(nextStep(session(five, missed), afterTime), { step: 'wrapup', cardId: 'last', waitMs: 5000 });
  assert.equal(summarize(missed).answered, 4);
  assert.equal(summarize(missed).percentCorrect, 75);
  // Right on it, with nothing else missed: straight to done.
  const right = [...before, { cardId: 'last', correct: true, at: afterTime, isWrapup: false }];
  assert.deepEqual(nextStep(session(five, right), afterTime), { step: 'done' });
  assert.equal(summarize(right).percentCorrect, 100);
});
