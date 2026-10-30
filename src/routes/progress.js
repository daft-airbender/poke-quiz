import { desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/client.js';
import { progress, quizSessions } from '../db/schema.js';
import { deleteUserData } from '../db/userData.js';
import { getMode, listModes } from '../quiz/modes/index.js';
import { badRequest } from './errors.js';

const WEAKEST_PER_MODE = 10;
const RECENT_SESSIONS = 10;

export function progressRouter() {
  const router = Router();

  // { modes: [{ id, label, answerType, totalItems, itemsSeen, answers, correct, weakest[] }], recentSessions[] }
  router.get('/progress/summary', async (req, res) => {
    const db = getDb();
    const [totals, weakest, recentSessions] = await Promise.all([
      db
        .select({
          mode: progress.mode,
          itemsSeen: sql`count(*)`.mapWith(Number),
          answers: sql`sum(${progress.timesSeen})`.mapWith(Number),
          correct: sql`sum(${progress.timesCorrect})`.mapWith(Number),
        })
        .from(progress)
        .where(eq(progress.userId, req.userId))
        .groupBy(progress.mode),

      // Per mode: questions missed at least once, lowest accuracy first, then most often seen.
      db.execute(sql`
        select mode, question_key, times_seen, times_correct
        from (
          select mode, question_key, times_seen, times_correct,
            row_number() over (
              partition by mode
              order by times_correct::float / times_seen, times_seen desc, last_seen_at desc
            ) as rank
          from ${progress}
          where ${progress.userId} = ${req.userId} and ${progress.timesCorrect} < ${progress.timesSeen}
        ) ranked
        where rank <= ${WEAKEST_PER_MODE}
        order by rank
      `),

      db
        .select({ mode: quizSessions.mode, total: quizSessions.total, correct: quizSessions.correct, finishedAt: quizSessions.finishedAt })
        .from(quizSessions)
        .where(eq(quizSessions.userId, req.userId))
        .orderBy(desc(quizSessions.finishedAt))
        .limit(RECENT_SESSIONS),
    ]);

    const totalsByMode = new Map(totals.map((row) => [row.mode, row]));
    const modes = listModes().map(({ description, example, allGenerations, allGenerationsNote, ...mode }) => ({
      ...mode,
      totalItems: mode.totalQuestions,
      itemsSeen: totalsByMode.get(mode.id)?.itemsSeen ?? 0,
      answers: totalsByMode.get(mode.id)?.answers ?? 0,
      correct: totalsByMode.get(mode.id)?.correct ?? 0,
      weakest: weakest.rows
        .filter((row) => row.mode === mode.id)
        .map((row) => ({
          questionKey: row.question_key,
          timesSeen: row.times_seen,
          timesCorrect: row.times_correct,
          ...getMode(mode.id).describe(row.question_key),
        }))
        // Keys a mode no longer recognizes (e.g. after a data change) have no title.
        .filter((item) => item.title),
    }));

    res.json({ modes, recentSessions });
  });

  // Deletes all of my progress and history (not my login or settings). Irreversible, so the body
  // must say { confirm: true }: a stray or replayed request without it does nothing.
  router.post('/progress/reset', async (req, res) => {
    if (req.body?.confirm !== true) throw badRequest('Send { "confirm": true } to delete all progress');
    res.json({ deleted: await deleteUserData(getDb(), req.userId) });
  });

  return router;
}
