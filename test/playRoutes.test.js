import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { isTierSnapshot } from '../src/db/srs.js';
import { sessionCookie, startTestServer } from './helpers.js';

// Checks that run before any query. The full Play flow is exercised against the dev database by hand.

let server;
before(async () => (server = await startTestServer()));
after(() => server.close());

const request = (method, path, body, cookie = sessionCookie()) =>
  fetch(server.baseUrl + path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  });

test('Play routes require a login', async () => {
  for (const [method, path] of [
    ['GET', '/api/play/overview'],
    ['POST', '/api/play/sessions'],
    ['GET', '/api/play/sessions/00000000-0000-0000-0000-000000000000/next'],
    ['POST', '/api/play/undo'],
    ['POST', '/api/play/new-cards/more'],
  ]) {
    assert.equal((await request(method, path, {}, null)).status, 401, path);
  }
});

test('starting a session checks kind, length and (Free Play) filter', async () => {
  for (const body of [
    {},
    { kind: 'nope' },
    { kind: 'play', length: { type: 'count', value: 30 } },
    { kind: 'play', length: 'long' },
    { kind: 'free_play', filter: { modes: [], gens: null } },
    { kind: 'free_play', filter: { modes: ['nope'], gens: null } },
    { kind: 'play', filter: { modes: null, gens: null } },
  ]) {
    const res = await request('POST', '/api/play/sessions', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('session ids that are not UUIDs are simply not found', async () => {
  for (const path of ['/api/play/sessions/123/next', '/api/play/sessions/abc/summary']) {
    assert.equal((await request('GET', path)).status, 404, path);
  }
  assert.equal((await request('POST', '/api/play/sessions/x/answers', { cardId: 1, rating: 3, mode: 'new' })).status, 404);
});

test('undo checks its body', async () => {
  const snapshot = { tier: 'rotation', bankedAt: null, masteredAt: null, bankCorrectDays: 0, bankLastCounted: null, bankPrevCounted: null };
  for (const body of [{}, { cardId: 1, logId: 2 }, { cardId: 1, logId: 2, undo: { ...snapshot, tier: 'gold' } }, { cardId: '1', logId: 2, undo: snapshot }]) {
    assert.equal((await request('POST', '/api/play/undo', body)).status, 400, JSON.stringify(body));
  }
});

test('isTierSnapshot accepts exactly the undo shape', () => {
  const good = { tier: 'bank', bankedAt: '2026-11-01T15:00:00.000Z', masteredAt: null, bankCorrectDays: 2, bankLastCounted: '2026-11-09', bankPrevCounted: null };
  assert.equal(isTierSnapshot(good), true);
  for (const bad of [null, [], { ...good, bankCorrectDays: -1 }, { ...good, bankedAt: 'yesterday' }, { ...good, bankLastCounted: '9 Nov' }, { ...good, tier: undefined }]) {
    assert.equal(isTierSnapshot(bad), false, JSON.stringify(bad));
  }
});
