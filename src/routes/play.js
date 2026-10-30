import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import {
  addMoreNewCards,
  endSession,
  getSession,
  isTierSnapshot,
  MODES_BY_KIND,
  nextForSession,
  playOverview,
  recordAnswer,
  sessionSummary,
  startSession,
  undoTransition,
} from '../db/srs.js';
import { createScheduler } from '../srs/scheduler.js';
import { lengthToUse, parseSessionLength } from '../srs/session.js';
import { badRequest } from './errors.js';
import { withDefaults } from './settings.js';

const scheduler = createScheduler();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER_MS = 60 * 60 * 1000;

function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

async function loadSession(req) {
  if (!UUID.test(req.params.id)) throw notFound('No such session');
  const session = await getSession(getDb(), req.userId, req.params.id);
  if (!session) throw notFound('No such session');
  return session;
}

// Spaced-repetition play (Play and practice sessions). Free Play has its own routes.
//   GET  /play/overview                   what Home shows: due now, new left today, tier counts, lengths
//   POST /play/sessions                   { kind, length? } -> { session, next }
//   GET  /play/sessions/:id/next          ?ending=1 after "Review N missed cards" -> next step
//   POST /play/sessions/:id/answers       { cardId, rating, mode, isWrapup, answerMs, ending? } -> { result, next }
//   POST /play/sessions/:id/end           { reason: 'limit' | 'quit' } -> { summary }
//   GET  /play/sessions/:id/summary       -> { summary }
//   POST /play/undo                       { cardId, logId, undo } -> { tier }
//   POST /play/new-cards/more             "Add 10 more" -> { newLeft }
export function playRouter() {
  const router = Router();

  router.get('/play/overview', async (req, res) => {
    const db = getDb();
    const [user] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, req.userId)).limit(1);
    const settings = withDefaults(user?.settings);
    res.json({
      ...(await playOverview(db, req.userId, new Date(), scheduler)),
      lengths: { play: lengthToUse(settings.lastLength.play), free_play: lengthToUse(settings.lastLength.free_play) },
    });
  });

  router.post('/play/sessions', async (req, res) => {
    const kind = req.body?.kind;
    if (!MODES_BY_KIND[kind]) throw badRequest(`kind must be one of: ${Object.keys(MODES_BY_KIND).join(', ')}`);
    let length = parseSessionLength(req.body?.length);
    if (req.body?.length !== undefined && !length) throw badRequest('length must be { type: count, value: 10|25|50 }, { type: timer, value: 5|10|20 } or { type: endless }');
    const db = getDb();
    if (!length) {
      const [user] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, req.userId)).limit(1);
      length = lengthToUse(withDefaults(user?.settings).lastLength.play);
    }
    const session = await startSession(db, req.userId, kind, length);
    const next = await nextForSession(db, req.userId, session, new Date(), scheduler);
    res.status(201).json({ session: { id: session.id, kind, length, startedAt: session.startedAt }, next });
  });

  router.get('/play/sessions/:id/next', async (req, res) => {
    const session = await loadSession(req);
    res.json(await nextForSession(getDb(), req.userId, session, new Date(), scheduler, { ending: req.query.ending === '1' }));
  });

  router.post('/play/sessions/:id/answers', async (req, res) => {
    const session = await loadSession(req);
    if (session.endedAt) throw Object.assign(new Error('This session has ended'), { status: 409 });
    const { cardId, rating, mode, isWrapup = false, answerMs = null, ending = false } = req.body ?? {};
    if (!Number.isInteger(cardId) || cardId < 1) throw badRequest('cardId must be a card id');
    if (![1, 2, 3, 4].includes(rating)) throw badRequest('rating must be 1 (again), 2 (hard), 3 (good) or 4 (easy)');
    if (!MODES_BY_KIND[session.kind].includes(mode)) throw badRequest(`mode must be one of: ${MODES_BY_KIND[session.kind].join(', ')}`);
    if (typeof isWrapup !== 'boolean' || typeof ending !== 'boolean') throw badRequest('isWrapup and ending must be true or false');
    if (answerMs !== null && !(Number.isInteger(answerMs) && answerMs >= 0 && answerMs <= MAX_ANSWER_MS)) {
      throw badRequest('answerMs must be a whole number of milliseconds');
    }

    const db = getDb();
    const now = new Date();
    const result = await recordAnswer(db, { userId: req.userId, session, cardId, rating, mode, isWrapup, answerMs, now, scheduler });
    const next = await nextForSession(db, req.userId, session, new Date(), scheduler, { ending });
    res.json({ result, next });
  });

  router.post('/play/sessions/:id/end', async (req, res) => {
    const session = await loadSession(req);
    const reason = req.body?.reason;
    if (reason !== 'limit' && reason !== 'quit') throw badRequest('reason must be limit or quit');
    const db = getDb();
    await endSession(db, req.userId, session.id, reason, new Date());
    res.json({ summary: await sessionSummary(db, req.userId, session) });
  });

  router.get('/play/sessions/:id/summary', async (req, res) => {
    const session = await loadSession(req);
    res.json({ summary: await sessionSummary(getDb(), req.userId, session) });
  });

  router.post('/play/undo', async (req, res) => {
    const { cardId, logId, undo } = req.body ?? {};
    if (!Number.isInteger(cardId) || !Number.isInteger(logId)) throw badRequest('cardId and logId must be ids');
    if (!isTierSnapshot(undo)) throw badRequest('undo must be the snapshot returned with the answer');
    res.json(await undoTransition(getDb(), { userId: req.userId, cardId, logId, undo, now: new Date() }));
  });

  router.post('/play/new-cards/more', async (req, res) => {
    res.json({ newLeft: await addMoreNewCards(getDb(), req.userId, new Date()) });
  });

  return router;
}
