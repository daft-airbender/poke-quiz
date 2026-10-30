import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionCookie, startTestServer } from './helpers.js';

// Route-level checks that don't need a database (validation runs before any query).
// Successful rounds, progress, and settings are covered against the dev database by hand.

let server;
before(async () => (server = await startTestServer()));
after(() => server.close());

const get = (path) => fetch(server.baseUrl + path, { headers: { Cookie: sessionCookie() } });
const send = (method, path, body) =>
  fetch(server.baseUrl + path, {
    method,
    headers: { Cookie: sessionCookie(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const post = (path, body) => send('POST', path, body);

test('GET /api/modes lists modes and generations', async () => {
  const res = await get('/api/modes');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.modes[0].id, 'name-text');
  assert.ok(body.modes.every((m) => m.id && m.label && m.answerType));
  assert.deepEqual(body.generations, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('GET /api/quiz rejects bad parameters with 400', async () => {
  for (const query of ['', 'mode=nope', 'mode=name&count=0', 'mode=name&count=51', 'mode=name&count=abc', 'mode=name&gens=0', 'mode=name&gens=1,x']) {
    const res = await get(`/api/quiz?${query}`);
    assert.equal(res.status, 400, query);
    assert.ok((await res.json()).error, query);
  }
});

test('POST /api/quiz/answer rejects bad bodies with 400', async () => {
  for (const body of [
    {},
    { mode: 'nope', questionKey: 'nope:1', correct: true },
    { mode: 'name-choice', questionKey: 'type:1', correct: true },
    { mode: 'name-choice', questionKey: 'name-choice:1', correct: 'yes' },
    { mode: 'name-choice', questionKey: `name-choice:${'x'.repeat(200)}`, correct: true },
  ]) {
    const res = await post('/api/quiz/answer', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('POST /api/quiz/session rejects bad bodies with 400', async () => {
  const valid = { mode: 'name-choice', total: 10, correct: 7, startedAt: '2026-10-29T10:00:00Z', finishedAt: '2026-10-29T10:05:00Z' };
  for (const body of [
    { ...valid, mode: 'nope' },
    { ...valid, total: 0 },
    { ...valid, correct: 11 },
    { ...valid, correct: -1 },
    { ...valid, startedAt: 'yesterday' },
    { ...valid, finishedAt: '2026-10-29T09:00:00Z' },
  ]) {
    const res = await post('/api/quiz/session', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('PUT /api/settings rejects bad values with 400', async () => {
  for (const body of [[], { roundLength: 15 }, { roundLength: '10' }, { gens: [0] }, { gens: [1, 1] }, { gens: '1' }, { autoAdvance: 'yes' }]) {
    const res = await send('PUT', '/api/settings', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('POST /api/progress/reset needs { confirm: true }', async () => {
  for (const body of [{}, { confirm: 'yes' }, { confirm: 1 }, []]) {
    const res = await post('/api/progress/reset', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('progress and settings routes require a login', async () => {
  for (const [method, path] of [['GET', '/api/progress/summary'], ['POST', '/api/progress/reset'], ['GET', '/api/settings'], ['PUT', '/api/settings']]) {
    const res = await fetch(server.baseUrl + path, { method });
    assert.equal(res.status, 401, path);
  }
});

test('a forged session cookie is rejected', async () => {
  const forged = sessionCookie().replace(/session\.sig=[^;]+/, 'session.sig=bad');
  const res = await fetch(`${server.baseUrl}/api/modes`, { headers: { Cookie: forged } });
  assert.equal(res.status, 401);
});
