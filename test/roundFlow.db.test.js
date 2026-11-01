import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { cardState, reviewLog, sessions, users } from '../src/db/schema.js';
import { sessionCookie, startTestServer } from './helpers.js';

// The round flow through the real routes and a real database. Runs with `npm run test:db` (dev database, .env) as a
// temporary user that is deleted afterwards; skipped by plain `npm test` and never run against production.
const skip = !process.env.DATABASE_URL || process.env.NODE_ENV === 'production';

let server;
let userId;
let cookie;

before(async () => {
  if (skip) return;
  server = await startTestServer();
  const [user] = await getDb()
    .insert(users)
    .values({ username: `round-flow-test-${Date.now()}`, passwordHash: 'not-a-real-hash' })
    .returning({ id: users.id });
  userId = user.id;
  cookie = sessionCookie({ userId, loginAt: Date.now() });
});

after(async () => {
  if (skip) return;
  server.close();
  const db = getDb();
  await db.delete(reviewLog).where(eq(reviewLog.userId, userId));
  await db.delete(cardState).where(eq(cardState.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await db.$client.end();
});

async function api(method, path, body) {
  const res = await fetch(server.baseUrl + path, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const start = (length, kind = 'play') => api('POST', '/api/play/sessions', { kind, length });
const rate = (id, card, rating) => api('POST', `/api/play/sessions/${id}/answers`, { cardId: card.id, rating, mode: card.mode, isWrapup: false });
const review = (id, card, correct) => api('POST', `/api/play/sessions/${id}/answers`, { cardId: card.id, correct, isWrapup: true });
const end = async (id) => (await api('POST', `/api/play/sessions/${id}/end`, { reason: 'limit' })).summary;

test('10 questions, 3 wrong: 70% however the review goes, and the review writes no FSRS rating', { skip }, async () => {
  const db = getDb();
  const { session, next: first } = await start({ type: 'count', value: 10 });
  let next = first;
  const missedIds = [];
  for (let i = 0; i < 10; i++) {
    assert.equal(next.step, 'question');
    assert.equal(next.card.isWrapup, false, `question ${i}`);
    if (i < 3) missedIds.push(next.card.id);
    ({ next } = await rate(session.id, next.card, i < 3 ? 1 : 3));
  }

  const stateOf = () => db.select().from(cardState).where(eq(cardState.userId, userId));
  const stateBefore = await stateOf();
  const reviewed = [];
  // One right, two wrong: neither direction may move the score.
  for (const correct of [true, false, false]) {
    assert.equal(next.step, 'question');
    assert.equal(next.card.isWrapup, true);
    assert.equal(next.card.mode, 'wrapup');
    assert.equal(next.card.preview, null, 'nothing to rate, so no due-date previews');
    reviewed.push(next.card.id);
    const res = await review(session.id, next.card, correct);
    assert.equal(res.result.correct, correct, 'the review answer still reports right or wrong');
    assert.equal(res.result.transition, null);
    next = res.next;
  }
  assert.deepEqual([...reviewed].sort(), [...missedIds].sort(), 'each missed card came back once');
  assert.equal(next.step, 'done');

  // card_state is byte-for-byte what the first attempts left it.
  const sorted = (rows) => [...rows].sort((a, b) => a.cardId - b.cardId);
  assert.deepEqual(sorted(await stateOf()), sorted(stateBefore));

  const logs = await db.select().from(reviewLog).where(and(eq(reviewLog.userId, userId), eq(reviewLog.sessionId, session.id), eq(reviewLog.isWrapup, true)));
  assert.equal(logs.length, 3);
  for (const log of logs) {
    assert.equal(log.mode, 'wrapup');
    assert.equal(log.stabilityAfter, log.stabilityBefore);
    assert.equal(log.difficultyAfter, log.difficultyBefore);
    assert.equal(+log.dueAfter, +log.dueBefore);
    assert.equal(log.tierAfter, log.tierBefore);
  }

  const summary = await end(session.id);
  assert.equal(summary.answered, 10);
  assert.equal(summary.correct, 7);
  assert.equal(summary.percentCorrect, 70);
  const { recentSessions } = await api('GET', '/api/progress/stats');
  const round = recentSessions.find((s) => new Date(s.startedAt).getTime() === new Date(session.startedAt).getTime());
  assert.deepEqual([round.answered, round.correct], [10, 7], 'Recent rounds agrees with the summary');
});

test('a wrap-up answer must say right or wrong; a rating alone is refused', { skip }, async () => {
  const { session, next } = await start({ type: 'endless' });
  const res = await fetch(`${server.baseUrl}/api/play/sessions/${session.id}/answers`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId: next.card.id, rating: 3, mode: next.card.mode, isWrapup: true }),
  });
  assert.equal(res.status, 400);
  await end(session.id);
});

test('a round with no misses goes straight to done', { skip }, async () => {
  const { session, next: first } = await start({ type: 'count', value: 10 });
  let next = first;
  for (let i = 0; i < 10; i++) ({ next } = await rate(session.id, next.card, 3));
  assert.equal(next.step, 'done');
  assert.equal(next.progress.wrapUpPending, 0);
  assert.equal((await end(session.id)).percentCorrect, 100);
});

// Moves a session's start back, so its timer has run out while the question on screen is unanswered.
const expireTimer = (id) => getDb().update(sessions).set({ startedAt: new Date(Date.now() - 6 * 60 * 1000) }).where(eq(sessions.id, id));

test('the timer runs out mid-question, wrong answer: it is scored, then the review starts', { skip }, async () => {
  const { session, next: first } = await start({ type: 'timer', value: 5 });
  const { next: onScreen } = await rate(session.id, first.card, 3);
  assert.equal(onScreen.card.isWrapup, false);

  await expireTimer(session.id);
  const { result, next } = await rate(session.id, onScreen.card, 1);
  assert.equal(result.correct, false);
  assert.equal(next.card.isWrapup, true);
  assert.equal(next.card.id, onScreen.card.id, 'the question answered after time ran out is the one to review');
  assert.equal(next.progress.wrapUpPending, 1);

  const { next: finished } = await review(session.id, next.card, true);
  assert.equal(finished.step, 'done');
  const summary = await end(session.id);
  assert.deepEqual([summary.answered, summary.correct, summary.percentCorrect], [2, 1, 50]);
});

test('the timer runs out mid-question, right answer, no misses: straight to done, and it counts', { skip }, async () => {
  const { session, next: onScreen } = await start({ type: 'timer', value: 5 });
  await expireTimer(session.id);
  const { next } = await rate(session.id, onScreen.card, 3);
  assert.equal(next.step, 'done');
  const summary = await end(session.id);
  assert.deepEqual([summary.answered, summary.percentCorrect], [1, 100]);
});

test('a repeat in the same round does not score, in the summary or in Recent rounds', { skip }, async () => {
  const { session, next } = await start({ type: 'endless' });
  await rate(session.id, next.card, 1);
  await rate(session.id, { ...next.card, mode: 'due' }, 3); // right the second time: still a miss
  const summary = await end(session.id);
  assert.deepEqual([summary.answered, summary.correct, summary.percentCorrect], [1, 0, 0]);
  const { recentSessions } = await api('GET', '/api/progress/stats');
  const round = recentSessions.find((s) => new Date(s.startedAt).getTime() === new Date(session.startedAt).getTime());
  assert.deepEqual([round.answered, round.correct], [1, 0]);
});

test('Free Play wrap-ups are unscored too', { skip }, async () => {
  const answer = (id, card, correct, isWrapup = false) => api('POST', `/api/play/sessions/${id}/answers`, { cardId: card.id, correct, isWrapup });
  const { session, next: first } = await start({ type: 'count', value: 10 }, 'free_play');
  let next = first;
  for (let i = 0; i < 10; i++) ({ next } = await answer(session.id, next.card, i >= 3));
  for (let i = 0; i < 3; i++) {
    assert.equal(next.card.isWrapup, true);
    ({ next } = await answer(session.id, next.card, true, true));
  }
  assert.equal(next.step, 'done');
  const summary = await end(session.id);
  assert.deepEqual([summary.answered, summary.percentCorrect], [10, 70]);
  assert.equal(summary.byType.reduce((sum, row) => sum + row.answered, 0), 10, 'accuracy by mode counts first attempts only');

  const stats = await api('GET', '/api/progress/stats');
  assert.deepEqual([stats.freePlay.allTime.answered, stats.freePlay.allTime.correct], [10, 7], 'Free Play all-time');
  assert.deepEqual([stats.freePlay.thisWeek.answered, stats.freePlay.thisWeek.correct], [10, 7], 'Free Play this week');
  assert.equal(stats.freePlay.byMode.reduce((sum, row) => sum + row.answered, 0), 10, 'Free Play by mode');
  assert.ok(stats.freePlay.mostMissed.every((card) => card.answered === 1 && card.missed === 1), 'most missed: a right review does not change it');

  // The calendar counts every answer as activity, but its % correct uses first attempts: the same numbers as the rounds.
  const today = stats.activity.at(-1);
  const rounds = stats.recentSessions;
  assert.equal(today.scored, rounds.reduce((sum, s) => sum + s.answered, 0));
  assert.equal(today.correct, rounds.reduce((sum, s) => sum + s.correct, 0));
  assert.ok(today.play + today.freePlay > today.scored, 'review answers still count as activity');
});
