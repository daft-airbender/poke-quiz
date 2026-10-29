import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { normalizeUsername, verifyPassword } from '../src/auth/passwords.js';
import { requireAuth, sessionUserId } from '../src/middleware/requireAuth.js';

// These tests don't touch the database: they cover everything that's decided before a query.

let server;
let baseUrl;

before(async () => {
  server = createApp({ sessionSecret: 'test-secret' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

const post = (path, body) =>
  fetch(baseUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('/healthz needs no auth', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('/api/me without a session is 401', async () => {
  const res = await fetch(`${baseUrl}/api/me`);
  assert.equal(res.status, 401);
});

test('protected /api routes without a session are 401', async () => {
  for (const [method, path] of [
    ['GET', '/api/quiz'],
    ['POST', '/api/quiz/answer'],
    ['GET', '/api/progress/summary'],
    ['GET', '/api/settings'],
    ['POST', '/api/logout'],
    ['GET', '/api/anything-else'],
  ]) {
    const res = await fetch(baseUrl + path, { method });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test('there is no signup route', async () => {
  for (const path of ['/api/signup', '/api/register', '/api/users']) {
    const res = await post(path, { username: 'x', password: 'y' });
    assert.equal(res.status, 401, path);
  }
});

test('login rejects missing or malformed fields with 400', async () => {
  for (const body of [{}, { username: 'ted' }, { password: 'pw' }, { username: 1, password: 2 }, { username: '', password: 'pw' }]) {
    const res = await post('/api/login', body);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('requireAuth sets req.userId from a fresh session', () => {
  const req = { session: { userId: 7, loginAt: Date.now() } };
  let called = false;
  requireAuth(req, {}, () => (called = true));
  assert.equal(called, true);
  assert.equal(req.userId, 7);
});

test('sessions expire 14 days after login, even if the cookie is still sent', () => {
  const day = 24 * 60 * 60 * 1000;
  assert.equal(sessionUserId({ session: { userId: 7, loginAt: Date.now() - 13 * day } }), 7);

  const expired = { session: { userId: 7, loginAt: Date.now() - 15 * day } };
  assert.equal(sessionUserId(expired), null);
  assert.equal(expired.session, null, 'expired session is cleared');

  assert.equal(sessionUserId({ session: { userId: 7 } }), null, 'session without loginAt is rejected');
});

test('usernames are case-insensitive and trimmed', () => {
  assert.equal(normalizeUsername('  Ted '), 'ted');
});

test('verifyPassword is false for a missing user', async () => {
  assert.equal(await verifyPassword('anything', undefined), false);
});
