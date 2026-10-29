import { and, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { getDb } from '../db/client.js';
import { progress, quizSessions } from '../db/schema.js';
import { generateRound } from '../quiz/generateRound.js';
import { getMode, listModes } from '../quiz/modes/index.js';
import { GENERATIONS } from '../quiz/pokemon.js';
import { badRequest } from './errors.js';

const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;
const MAX_KEY_LENGTH = 120;

function parseCount(value) {
  if (value === undefined) return DEFAULT_COUNT;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw badRequest(`count must be a whole number from 1 to ${MAX_COUNT}`);
  }
  return count;
}

// "1,2" -> [1, 2]; missing or empty -> [] (all generations).
function parseGens(value) {
  if (value === undefined || value === '') return [];
  const gens = String(value).split(',').map(Number);
  if (!gens.every((gen) => GENERATIONS.includes(gen))) {
    throw badRequest(`gens must be a comma-separated list from ${GENERATIONS.join(', ')}`);
  }
  return gens;
}

function parseMode(value) {
  const mode = typeof value === 'string' && getMode(value);
  if (!mode) throw badRequest(`mode must be one of: ${listModes().map((m) => m.id).join(', ')}`);
  return mode;
}

function parseDate(value, field) {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw badRequest(`${field} must be an ISO date string`);
  return date;
}

export function quizRouter() {
  const router = Router();

  router.get('/modes', (req, res) => {
    res.json({ modes: listModes(), generations: GENERATIONS });
  });

  router.get('/quiz', async (req, res) => {
    const mode = parseMode(req.query.mode);
    const count = parseCount(req.query.count);
    const gens = parseGens(req.query.gens);

    // This mode's history, so the round favors new and weak questions.
    const records = await getDb()
      .select({
        questionKey: progress.questionKey,
        timesSeen: progress.timesSeen,
        timesCorrect: progress.timesCorrect,
        streak: progress.streak,
        lastSeenAt: progress.lastSeenAt,
      })
      .from(progress)
      .where(and(eq(progress.userId, req.userId), eq(progress.mode, mode.id)));

    const questions = generateRound({
      modeId: mode.id,
      count,
      gens,
      progress: new Map(records.map((record) => [record.questionKey, record])),
    });
    res.json({ mode: mode.id, questions });
  });

  // Records one answered question: { questionKey, mode, correct }.
  router.post('/quiz/answer', async (req, res) => {
    const { questionKey, correct } = req.body ?? {};
    const mode = parseMode(req.body?.mode);
    if (typeof questionKey !== 'string' || questionKey.length > MAX_KEY_LENGTH || !questionKey.startsWith(`${mode.id}:`)) {
      throw badRequest(`questionKey must be a "${mode.id}:..." key`);
    }
    if (typeof correct !== 'boolean') throw badRequest('correct must be true or false');

    const [row] = await getDb()
      .insert(progress)
      .values({
        userId: req.userId,
        questionKey,
        mode: mode.id,
        timesSeen: 1,
        timesCorrect: correct ? 1 : 0,
        streak: correct ? 1 : 0,
        lastSeenAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [progress.userId, progress.questionKey],
        set: {
          timesSeen: sql`${progress.timesSeen} + 1`,
          timesCorrect: sql`${progress.timesCorrect} + ${correct ? 1 : 0}`,
          streak: correct ? sql`${progress.streak} + 1` : 0,
          lastSeenAt: sql`now()`,
        },
      })
      .returning({ timesSeen: progress.timesSeen, timesCorrect: progress.timesCorrect, streak: progress.streak });

    res.json(row);
  });

  // Records a finished round: { mode, total, correct, startedAt, finishedAt }.
  router.post('/quiz/session', async (req, res) => {
    const { total, correct } = req.body ?? {};
    const mode = parseMode(req.body?.mode);
    if (!Number.isInteger(total) || total < 1 || total > MAX_COUNT) {
      throw badRequest(`total must be a whole number from 1 to ${MAX_COUNT}`);
    }
    if (!Number.isInteger(correct) || correct < 0 || correct > total) {
      throw badRequest('correct must be a whole number from 0 to total');
    }
    const startedAt = parseDate(req.body.startedAt, 'startedAt');
    const finishedAt = parseDate(req.body.finishedAt, 'finishedAt');
    if (finishedAt < startedAt) throw badRequest('finishedAt must not be before startedAt');

    const [row] = await getDb()
      .insert(quizSessions)
      .values({ userId: req.userId, mode: mode.id, total, correct, startedAt, finishedAt })
      .returning({ id: quizSessions.id });

    res.status(201).json(row);
  });

  return router;
}
