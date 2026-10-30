import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/client.js';
import { cards, reviewLog, sessions } from '../db/schema.js';
import { deleteUserData } from '../db/userData.js';
import { playOverview } from '../db/srs.js';
import { createScheduler } from '../srs/scheduler.js';
import { badRequest } from './errors.js';

const RECENT_SESSIONS = 10;
const scheduler = createScheduler();

export function progressRouter() {
  const router = Router();

  // A simple overview until the full Progress screen (SRS phase S8):
  // { tiers: { unseen, rotation, bank, mastered }, dueNow, newLeft, recentSessions: [{ kind, startedAt, answered, correct }] }
  router.get('/progress/summary', async (req, res) => {
    const db = getDb();
    const [overview, activeCards, recent] = await Promise.all([
      playOverview(db, req.userId, new Date(), scheduler),
      db.$count(cards, eq(cards.active, true)),
      db
        .select({ id: sessions.id, kind: sessions.kind, startedAt: sessions.startedAt, lengthType: sessions.lengthType, lengthValue: sessions.lengthValue })
        .from(sessions)
        .where(and(eq(sessions.userId, req.userId), sql`exists (select 1 from ${reviewLog} where ${reviewLog.sessionId} = ${sessions.id})`))
        .orderBy(desc(sessions.startedAt))
        .limit(RECENT_SESSIONS),
    ]);
    const counts = recent.length
      ? await db
          .select({
            sessionId: reviewLog.sessionId,
            answered: sql`count(*)`.mapWith(Number),
            correct: sql`count(*) filter (where ${reviewLog.rating} > 1)`.mapWith(Number),
          })
          .from(reviewLog)
          .where(inArray(reviewLog.sessionId, recent.map((s) => s.id)))
          .groupBy(reviewLog.sessionId)
      : [];
    const bySession = new Map(counts.map((c) => [c.sessionId, c]));
    const studied = overview.rotation + overview.bank + overview.mastered;
    res.json({
      tiers: { unseen: Math.max(0, activeCards - studied), rotation: overview.rotation, bank: overview.bank, mastered: overview.mastered },
      dueNow: overview.dueNow,
      newLeft: overview.newLeft,
      recentSessions: recent.map((s) => ({
        kind: s.kind,
        startedAt: s.startedAt,
        answered: bySession.get(s.id)?.answered ?? 0,
        correct: bySession.get(s.id)?.correct ?? 0,
      })),
    });
  });

  // Deletes all of my progress and history (not my login or settings). Irreversible, so the body
  // must say { confirm: true }: a stray or replayed request without it does nothing.
  router.post('/progress/reset', async (req, res) => {
    if (req.body?.confirm !== true) throw badRequest('Send { "confirm": true } to delete all progress');
    res.json({ deleted: await deleteUserData(getDb(), req.userId) });
  });

  return router;
}
