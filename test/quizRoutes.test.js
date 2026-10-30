import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionCookie, startTestServer } from './helpers.js';

// Route-level checks that don't need a database (validation runs before any query).
// Play, progress and settings are covered against the dev database by hand.

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

test('PUT /api/settings rejects bad values with 400', async () => {
  for (const body of [[], { theme: 0 }, { theme: '25' }, { playScope: { modes: [], gens: null } }, { playScope: { modes: null, gens: [1, 1] } }, { lastLength: { play: { type: 'count', value: 7 } } }]) {
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
  for (const [method, path] of [['GET', '/api/progress/stats'], ['POST', '/api/progress/reset'], ['GET', '/api/settings'], ['PUT', '/api/settings']]) {
    const res = await fetch(server.baseUrl + path, { method });
    assert.equal(res.status, 401, path);
  }
});

test('a forged session cookie is rejected', async () => {
  const forged = sessionCookie().replace(/session\.sig=[^;]+/, 'session.sig=bad');
  const res = await fetch(`${server.baseUrl}/api/modes`, { headers: { Cookie: forged } });
  assert.equal(res.status, 401);
});
