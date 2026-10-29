// Fixed lifetime from login (not extended on each visit), then log in again.
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// The logged-in user's id, or null. The cookie's own expiry is only enforced by the
// browser, so the login time stored in the session is checked here as well.
export function sessionUserId(req) {
  const { userId, loginAt } = req.session ?? {};
  if (!userId) return null;
  if (!loginAt || Date.now() - loginAt > SESSION_MAX_AGE_MS) {
    req.session = null;
    return null;
  }
  return userId;
}

// Rejects requests without a logged-in session. Sets req.userId for route handlers,
// which must use it to scope every query to the current user.
export function requireAuth(req, res, next) {
  const userId = sessionUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not logged in' });
  req.userId = userId;
  next();
}
