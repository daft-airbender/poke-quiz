import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieSession from 'cookie-session';
import express from 'express';
import { requireAuth, SESSION_MAX_AGE_MS } from './middleware/requireAuth.js';
import { authRouter } from './routes/auth.js';
import { cardsRouter } from './routes/cards.js';
import { playRouter } from './routes/play.js';
import { progressRouter } from './routes/progress.js';
import { quizRouter } from './routes/quiz.js';
import { settingsRouter } from './routes/settings.js';
import { themesRouter } from './routes/themes.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Builds the Express app without starting it, so tests can run it on a random port.
export function createApp({ sessionSecret = process.env.SESSION_SECRET } = {}) {
  if (!sessionSecret) throw new Error('SESSION_SECRET is not set');

  const app = express();

  // Render terminates TLS at its proxy; needed for secure cookies and real client IPs.
  app.set('trust proxy', 1);

  // Health check for Render. No auth, no DB hit.
  app.get('/healthz', (req, res) => {
    res.type('text').send('ok');
  });

  // Frontend libraries, served straight from node_modules (no build step, no CDN).
  // public/index.html maps bare imports like 'preact' to these paths via an import map.
  app.use('/vendor/preact', express.static(path.join(rootDir, 'node_modules/preact')));
  app.use('/vendor/htm', express.static(path.join(rootDir, 'node_modules/htm')));
  app.use(express.static(path.join(rootDir, 'public')));
  // Plain modules used by both the server and the browser (e.g. name matching).
  app.use('/shared', express.static(path.join(rootDir, 'shared')));

  app.use(express.json());
  app.use(
    cookieSession({
      name: 'session',
      keys: [sessionSecret],
      maxAge: SESSION_MAX_AGE_MS,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    }),
  );

  // /api/login and /api/me work without a session; everything after requireAuth needs one.
  app.use('/api', authRouter());
  app.use('/api', requireAuth);
  app.use('/api', quizRouter());
  app.use('/api', progressRouter());
  app.use('/api', settingsRouter());
  app.use('/api', themesRouter());
  app.use('/api', playRouter());
  app.use('/api', cardsRouter());

  // Unknown API routes (only reachable when logged in).
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // JSON errors for the API instead of Express's default HTML page.
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    const status = err.status ?? err.statusCode ?? 500;
    res.status(status).json({ error: status < 500 ? err.message : 'Something went wrong' });
  });

  return app;
}
