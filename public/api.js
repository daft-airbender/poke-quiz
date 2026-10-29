// fetch wrapper for the JSON API.
// - Long timeout: after idle, Render and Neon both cold-start, so a request can take a while.
// - Requests slower than SLOW_AFTER_MS flip a "slow" flag the app shows as "Waking up the server…".
// - A 401 from a protected route (session expired) calls the unauthorized handler.

const TIMEOUT_MS = 60_000;
const SLOW_AFTER_MS = 1500;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let slowCount = 0;
const slowListeners = new Set();

// Subscribe to "is any request slow right now?". Returns an unsubscribe function.
export function onSlowChange(listener) {
  slowListeners.add(listener);
  return () => slowListeners.delete(listener);
}

function changeSlowCount(delta) {
  slowCount += delta;
  for (const listener of slowListeners) listener(slowCount > 0);
}

let unauthorizedHandler = () => {};

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export async function api(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let slow = false;
  const slowTimer = setTimeout(() => {
    slow = true;
    changeSlowCount(1);
  }, SLOW_AFTER_MS);

  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && path !== '/api/login' && path !== '/api/me') unauthorizedHandler();
      throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') throw new ApiError(0, 'The server took too long to respond. Try again.');
    throw new ApiError(0, "Couldn't reach the server. Check your connection.");
  } finally {
    clearTimeout(timeout);
    clearTimeout(slowTimer);
    if (slow) changeSlowCount(-1);
  }
}
