import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/client.js';
import { reviewLog, sessions } from '../db/schema.js';
import { progressStats } from '../db/stats.js';
import { deleteUserData } from '../db/userData.js';
import { badRequest } from './errors.js';

const RECENT_SESSIONS = 10;

// The last few sessions that had answers: [{ kind, startedAt, answered, correct }].
async function recentSessions(db, userId) {
  const recent = await db
    .select({ id: sessions.id, kind: sessions.kind, startedAt: sessions.startedAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), sql`exists (select 1 from ${reviewLog} where ${reviewLog.sessionId} = ${sessions.id})`))
    .orderBy(desc(sessions.startedAt))
    .limit(RECENT_SESSIONS);
  if (!recent.length) return [];
  const counts = await db
    .select({
      sessionId: reviewLog.sessionId,
      answered: sql`count(*)`.mapWith(Number),
      correct: sql`count(*) filter (where ${reviewLog.rating} > 1)`.mapWith(Number),
    })
    .from(reviewLog)
    .where(inArray(reviewLog.sessionId, recent.map((s) => s.id)))
    .groupBy(reviewLog.sessionId);
  const bySession = new Map(counts.map((c) => [c.sessionId, c]));
  return recent.map((s) => ({ kind: s.kind, startedAt: s.startedAt, answered: bySession.get(s.id).answered, correct: bySession.get(s.id).correct }));
}

export function progressRouter() {
  const router = Router();

  // The Progress screen: headline numbers, collection growth, recall rate, categories, activity, Free Play.
  router.get('/progress/stats', async (req, res) => {
    const db = getDb();
    const [stats, recent] = await Promise.all([progressStats(db, req.userId, new Date()), recentSessions(db, req.userId)]);
    res.json({ ...stats, recentSessions: recent });
  });

  // Deletes all of my progress and history (not my login or settings). Irreversible, so the body
  // must say { confirm: true }: a stray or replayed request without it does nothing.
  router.post('/progress/reset', async (req, res) => {
    if (req.body?.confirm !== true) throw badRequest('Send { "confirm": true } to delete all progress');
    res.json({ deleted: await deleteUserData(getDb(), req.userId) });
  });

  return router;
}
