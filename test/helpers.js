import crypto from 'node:crypto';
import { createApp } from '../src/app.js';

export const TEST_SECRET = 'test-secret';

// Starts the app on a random port. Returns { baseUrl, close }.
export async function startTestServer() {
  const server = createApp({ sessionSecret: TEST_SECRET }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { baseUrl: `http://localhost:${server.address().port}`, close: () => server.close() };
}

// A Cookie header for a logged-in session, signed the way cookie-session (Keygrip, HMAC-SHA1) does,
// so route tests can get past requireAuth without a database.
export function sessionCookie(session = { userId: 1, loginAt: Date.now() }) {
  const value = Buffer.from(JSON.stringify(session)).toString('base64');
  const sig = crypto
    .createHmac('sha1', TEST_SECRET)
    .update(`session=${value}`)
    .digest('base64')
    .replace(/\/|\+|=/g, (c) => ({ '/': '_', '+': '-', '=': '' })[c]);
  return `session=${value}; session.sig=${sig}`;
}
