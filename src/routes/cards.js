import { Router } from 'express';
import { actOnCard, actOnMatching, cardDetails, LIST_TIERS, listCards, PAGE_SIZE, SORTS } from '../db/cardList.js';
import { getDb } from '../db/client.js';
import { listModes } from '../quiz/modes/index.js';
import { GENERATIONS } from '../quiz/pokemon.js';
import { createScheduler } from '../srs/scheduler.js';
import { badRequest } from './errors.js';

const scheduler = createScheduler();
const MODE_IDS = listModes().map((mode) => mode.id);
const ACTIONS = ['restore', 'demote', 'move_to_bank', 'mark_mastered'];
const MAX_QUERY_LENGTH = 40;
const MAX_RANDOM = 1000;

// { tier, mode, gen, q } from a query string or body, checked.
function parseFilters(input = {}) {
  const { tier = 'all', mode, gen, q } = input;
  if (!LIST_TIERS.includes(tier)) throw badRequest(`tier must be one of: ${LIST_TIERS.join(', ')}`);
  if (mode !== undefined && mode !== '' && !MODE_IDS.includes(mode)) throw badRequest('Unknown mode');
  const generation = gen === undefined || gen === '' ? undefined : Number(gen);
  if (generation !== undefined && !GENERATIONS.includes(generation)) throw badRequest('Unknown generation');
  if (q !== undefined && (typeof q !== 'string' || q.length > MAX_QUERY_LENGTH)) throw badRequest(`q must be at most ${MAX_QUERY_LENGTH} characters`);
  return { tier, mode: mode || undefined, gen: generation, q: q?.trim() || undefined };
}

function parseCardId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('No such card'), { status: 404 });
  return id;
}

function parseAction(value) {
  if (!ACTIONS.includes(value)) throw badRequest(`action must be one of: ${ACTIONS.join(', ')}`);
  return value;
}

// The card screens (Learning / Bank / Mastered / Trouble / All):
//   GET  /cards?tier&mode&gen&q&sort&offset   one page (50) of cards, with each card's recall chance now
//   GET  /cards/:id                           one card's details and the actions it allows
//   POST /cards/:id/action                    { action } (restore | demote | move_to_bank | mark_mastered)
//   POST /cards/bulk                          { action, filters: { tier, mode, gen, q }, count? } -> all matching, or `count` at random
export function cardsRouter() {
  const router = Router();

  router.get('/cards', async (req, res) => {
    const filters = parseFilters(req.query);
    const sort = req.query.sort ?? 'fading';
    if (!SORTS.includes(sort)) throw badRequest(`sort must be one of: ${SORTS.join(', ')}`);
    const offset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0) throw badRequest('offset must be a whole number');
    const page = await listCards(getDb(), req.userId, filters, { sort, offset, now: new Date(), scheduler });
    res.json({ ...page, offset, pageSize: PAGE_SIZE });
  });

  router.get('/cards/:id', async (req, res) => {
    const cardId = parseCardId(req.params.id);
    const details = await cardDetails(getDb(), req.userId, cardId, { now: new Date(), scheduler });
    if (!details) throw Object.assign(new Error('No such card'), { status: 404 });
    res.json(details);
  });

  router.post('/cards/:id/action', async (req, res) => {
    const cardId = parseCardId(req.params.id);
    const action = parseAction(req.body?.action);
    res.json(await actOnCard(getDb(), req.userId, cardId, action, new Date()));
  });

  router.post('/cards/bulk', async (req, res) => {
    const action = parseAction(req.body?.action);
    const filters = parseFilters(req.body?.filters);
    const count = req.body?.count ?? null;
    if (count !== null && !(Number.isInteger(count) && count >= 1 && count <= MAX_RANDOM)) throw badRequest(`count must be 1 to ${MAX_RANDOM}`);
    res.json(await actOnMatching(getDb(), req.userId, filters, action, { count, now: new Date() }));
  });

  return router;
}
