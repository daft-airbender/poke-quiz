import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { normalizeUsername, verifyPassword } from '../auth/passwords.js';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { requireAuth, sessionUserId } from '../middleware/requireAuth.js';

// Generous enough for real usernames/passwords, small enough to reject junk cheaply.
const MAX_FIELD_LENGTH = 200;

export function authRouter() {
  const router = Router();

  // 5 failed attempts per 15 minutes per IP. Successful logins don't count,
  // so logging in on several devices never locks me out.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    const valid = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_LENGTH;
    if (!valid(username) || !valid(password)) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const [user] = await getDb()
      .select({ id: users.id, username: users.username, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.username, normalizeUsername(username)))
      .limit(1);

    // Same message and (roughly) same timing whether the username or the password was wrong.
    if (!(await verifyPassword(password, user?.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.loginAt = Date.now();
    res.json({ username: user.username });
  });

  router.post('/logout', requireAuth, (req, res) => {
    req.session = null;
    res.status(204).end();
  });

  // Lets the frontend decide between the login screen and the app on page load.
  router.get('/me', async (req, res) => {
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not logged in' });

    const [user] = await getDb()
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // The account was deleted since this cookie was issued.
    if (!user) {
      req.session = null;
      return res.status(401).json({ error: 'Not logged in' });
    }
    res.json({ username: user.username });
  });

  return router;
}
