// Rejects requests without a logged-in session. Sets req.userId for route handlers,
// which must use it to scope every query to the current user.
export function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not logged in' });
  req.userId = userId;
  next();
}
