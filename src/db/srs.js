// The database side of spaced-repetition play: loads what the pure rules in src/srs/ need, and saves
// what they decide. Every query is scoped to one user.
//
// Retrievability is computed in SQL (retrievabilitySql) so the database can rank thousands of cards and send back only
// the few candidates each queue tier needs; the pure queue (src/srs/queue.js) then makes the final pick
// with the exact library values.
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { getMode, listModes } from '../quiz/modes/index.js';
import { questionForCard } from '../srs/catalog.js';
import { SRS_CONFIG } from '../srs/config.js';
import { addDays, dayKey } from '../srs/days.js';
import { accuracyByType, shownThisPass } from '../srs/freePlay.js';
import { inPlayScope, newCardsLeft, orderNewCards, pickNextCard, pickPracticeCard } from '../srs/queue.js';
import { reviewCard } from '../srs/review.js';
import { cardFromRow, rowFromCard, tierSnapshotFromJson } from '../srs/rows.js';
import { newCardMemory } from '../srs/scheduler.js';
import { nextStep, progressLabel, summarize, wrapUpCards } from '../srs/session.js';
import { newTierFields } from '../srs/tiers.js';
import { cardEvents, cards, cardState, dailyTierSnapshot, reviewLog, sessions, users } from './schema.js';

// Review-log modes each session kind may record. Free Play answers never go through the scheduler.
export const MODES_BY_KIND = {
  play: ['due', 'ahead', 'new', 'bank_checkin'],
  bank_practice: ['bank_practice'],
  mastered_practice: ['mastered_practice'],
  free_play: ['free_play'],
};
const PRACTICE_TIER = { bank_practice: 'bank', mastered_practice: 'mastered' };

// Enough candidates per tier that the 8-card cooldown can never hide the true best one.
const CANDIDATES_PER_TIER = 40;
// Unseen cards fetched per card type, for choosing which type introduces the next new card.
const NEW_PER_TYPE = 3;
// A small margin so SQL rounding never drops a check-in the exact JS check would include.
const CHECK_IN_MARGIN = 0.001;

const MODE_IDS = listModes().map((mode) => mode.id);
const MODE_LABELS = new Map(listModes().map((mode) => [mode.id, mode.label]));
const ALL_GENERATION_MODES = listModes()
  .filter((mode) => mode.allGenerations)
  .map((mode) => mode.id);

// Retrievability in SQL, matching ts-fsrs: (1 + factor * whole days since last review / stability) ^ decay.
export function retrievabilitySql(curve, now) {
  const days = sql`greatest(floor(extract(epoch from (${now}::timestamptz - ${cardState.lastReviewAt})) / 86400), 0)`;
  return sql`(case when ${cardState.lastReviewAt} is null or ${cardState.fsrsState} = 'new' then 0
    else power(1 + ${curve.factor}::float8 * ${days} / ${cardState.stability}, ${curve.decay}::float8) end)`;
}

// Would a correct answer to this banked card count toward Mastered today? The SQL twin of bankAnswerWouldCount
// (src/srs/tiers.js): 7+ New York days since the later of its last counted day and the day it was banked.
function bankCountsTodaySql(now) {
  const today = dayKey(now, SRS_CONFIG.timeZone);
  const bankedDay = sql`(${cardState.bankedAt} at time zone ${SRS_CONFIG.timeZone})::date`;
  return sql`(${cardState.tier} = 'bank' and greatest(${cardState.bankLastCounted}, ${bankedDay})
    <= ${today}::date - ${SRS_CONFIG.mastery.minDaysBetweenCountedDays}::int)`;
}

// A studied card as the queue sees it: { id, cardType, promptKey, generation, ...card (memory, tier fields) }.
const studiedColumns = { state: cardState, cardType: cards.cardType, promptKey: cards.promptKey, generation: cards.generation };
const toStudied = ({ state, cardType, promptKey, generation }) => ({ id: state.cardId, cardType, promptKey, generation, ...cardFromRow(state) });

function studiedQuery(db, userId) {
  return db
    .select(studiedColumns)
    .from(cardState)
    .innerJoin(cards, eq(cards.id, cardState.cardId))
    .where(eq(cardState.userId, userId))
    .$dynamic();
}

// ---------------------------------------------------------------------------------------------
// Settings-backed values

async function rawSettings(db, userId) {
  const [user] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.settings ?? {};
}

// Today's new-card allowance: { introducedToday, extraToday, limit } (limit: the user's setting, null = unlimited).
async function newToday(db, userId, now, settings) {
  const today = dayKey(now, SRS_CONFIG.timeZone);
  const [{ count }] = await db
    .select({ count: sql`count(distinct ${reviewLog.cardId})`.mapWith(Number) })
    .from(reviewLog)
    .where(
      and(
        eq(reviewLog.userId, userId),
        eq(reviewLog.mode, 'new'),
        gt(reviewLog.reviewedAt, new Date(now - 2 * 24 * 60 * 60 * 1000)), // narrow by index, then by calendar day
        sql`(${reviewLog.reviewedAt} at time zone ${SRS_CONFIG.timeZone})::date = ${today}::date`,
      ),
    );
  const extra = settings.newCardsExtra?.day === today ? settings.newCardsExtra.count : 0;
  return { introducedToday: count, extraToday: extra, limit: settings.newCardsPerDay ?? SRS_CONFIG.newCardsPerDay };
}

// "Add 10 more" new cards for today.
export async function addMoreNewCards(db, userId, now) {
  const today = dayKey(now, SRS_CONFIG.timeZone);
  const step = SRS_CONFIG.addMoreNewCards;
  await db
    .update(users)
    .set({
      settings: sql`${users.settings} || jsonb_build_object('newCardsExtra', jsonb_build_object('day', ${today}::text, 'count',
        case when ${users.settings} -> 'newCardsExtra' ->> 'day' = ${today} then (${users.settings} -> 'newCardsExtra' ->> 'count')::int + ${step}::int else ${step}::int end))`,
    })
    .where(eq(users.id, userId));
  return finiteOrNull(newCardsLeft(await newToday(db, userId, now, await rawSettings(db, userId))));
}

// For JSON: Infinity (no daily limit) becomes null.
const finiteOrNull = (n) => (Number.isFinite(n) ? n : null);

// Remembers the length just used, per kind (practice sessions share Play's).
async function rememberLength(db, userId, kind, length) {
  const key = kind === 'free_play' ? 'free_play' : 'play';
  await db
    .update(users)
    .set({
      settings: sql`${users.settings} || jsonb_build_object('lastLength',
        coalesce(${users.settings} -> 'lastLength', '{"play": null, "free_play": null}'::jsonb) || jsonb_build_object(${key}::text, ${JSON.stringify(length)}::jsonb))`,
    })
    .where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------------------------
// Sessions

// filter: Free Play's { modes, gens } (remembered as the next Free Play's default); null for other kinds.
export async function startSession(db, userId, kind, length, filter = null) {
  const [session] = await db
    .insert(sessions)
    .values({ userId, kind, lengthType: length.type, lengthValue: length.value ?? null, filter })
    .returning();
  await rememberLength(db, userId, kind, length);
  if (filter) {
    await db
      .update(users)
      .set({ settings: sql`${users.settings} || jsonb_build_object('freePlayFilter', ${JSON.stringify(filter)}::jsonb)` })
      .where(eq(users.id, userId));
  }
  return session;
}

export async function getSession(db, userId, sessionId) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  return session ?? null;
}

// This session's answers, oldest first.
async function sessionAnswers(db, sessionId) {
  return db
    .select({
      id: reviewLog.id,
      cardId: reviewLog.cardId,
      rating: reviewLog.rating,
      at: reviewLog.reviewedAt,
      isWrapup: reviewLog.isWrapup,
      mode: reviewLog.mode,
      tierBefore: reviewLog.tierBefore,
      tierAfter: reviewLog.tierAfter,
    })
    .from(reviewLog)
    .where(eq(reviewLog.sessionId, sessionId))
    .orderBy(asc(reviewLog.id));
}

const lengthOf = (session) => (session.lengthType === 'endless' ? { type: 'endless' } : { type: session.lengthType, value: session.lengthValue });

// ---------------------------------------------------------------------------------------------
// Choosing the next card

// The studied cards the queue needs to see (a few per tier, ranked in SQL), plus the next new cards.
async function playCandidates(db, userId, now, scheduler, settings) {
  const r = retrievabilitySql(scheduler.curve, now);
  const rotation = eq(cardState.tier, 'rotation');
  // What to learn applies to everything Play shows: cards outside it wait until they're included again.
  const inScope = scopeSql(settings.playScope);
  const limit = CANDIDATES_PER_TIER;
  const [steps, dueReviews, checkIns, anyBank, ahead] = await Promise.all([
    studiedQuery(db, userId)
      .where(and(eq(cardState.userId, userId), inScope, rotation, inArray(cardState.fsrsState, ['learning', 'relearning']), sql`${cardState.dueAt} <= ${now}`))
      .orderBy(asc(cardState.dueAt))
      .limit(limit),
    studiedQuery(db, userId)
      .where(and(eq(cardState.userId, userId), inScope, rotation, eq(cardState.fsrsState, 'review'), sql`${cardState.dueAt} <= ${now}`))
      .orderBy(r, sql`random()`) // ties (same R) in random order, not card id order
      .limit(limit),
    studiedQuery(db, userId)
      .where(and(eq(cardState.userId, userId), inScope, eq(cardState.tier, 'bank'), sql`${r} < ${SRS_CONFIG.bank.checkInBelowRetrievability + CHECK_IN_MARGIN}`))
      .orderBy(r, sql`random()`) // ties (same R) in random order, not card id order
      .limit(limit),
    studiedQuery(db, userId)
      .where(and(eq(cardState.userId, userId), eq(cardState.tier, 'bank')))
      .limit(1),
    // Working ahead: not cards already answered today (a same-day repeat adds almost nothing to memory).
    studiedQuery(db, userId)
      .where(
        and(
          eq(cardState.userId, userId),
          inScope,
          rotation,
          sql`${cardState.fsrsState} <> 'new'`,
          sql`(${cardState.lastReviewAt} at time zone ${SRS_CONFIG.timeZone})::date < ${dayKey(now, SRS_CONFIG.timeZone)}::date`,
        ),
      )
      .orderBy(r, sql`random()`) // ties (same R) in random order, not card id order
      .limit(limit),
  ]);
  const byId = new Map([...steps, ...dueReviews, ...checkIns, ...anyBank, ...ahead].map((row) => [row.state.cardId, toStudied(row)]));

  const today = await newToday(db, userId, now, settings);
  // Fetched even when today's limit is reached, so "Add more new cards" can tell there are some left.
  const newCards = await nextNewCards(db, userId, settings.playScope);
  return { studied: [...byId.values()], newCards, newToday: today };
}

// SQL condition for active cards in a { modes, gens } scope (null = all). Cards with no generation, and modes
// that always use every generation (regions), only depend on the mode, as in inPlayScope.
function scopeSql(scope) {
  const modes = scope?.modes ?? MODE_IDS;
  const gens = scope?.gens
    ? sql`and (${cards.generation} is null or ${cards.generation} = any(${sql.param(scope.gens)}::int[])
        or ${cards.cardType} = any(${sql.param(ALL_GENERATION_MODES)}::text[]))`
    : sql``;
  return sql`${cards.active} and ${cards.cardType} = any(${sql.param(modes)}::text[]) ${gens}`;
}

// The next unseen cards in the Play scope, in introduction order: a few random ones per card type, then
// orderNewCards takes turns between types.
async function nextNewCards(db, userId, scope) {
  const unseen = await db.execute(sql`
    select id, card_type, generation, sort_order, prompt_key from (
      select ${cards.id} as id, ${cards.cardType} as card_type, ${cards.generation} as generation,
        ${cards.sortOrder} as sort_order, ${cards.promptKey} as prompt_key,
        row_number() over (partition by ${cards.cardType} order by random()) as rank
      from ${cards}
      where ${scopeSql(scope)}
        and not exists (select 1 from ${cardState} where ${cardState.userId} = ${userId} and ${cardState.cardId} = ${cards.id})
    ) ranked where rank <= ${NEW_PER_TYPE}`);
  const introducedByType = await db
    .select({ cardType: cards.cardType, count: sql`count(*)`.mapWith(Number) })
    .from(cardState)
    .innerJoin(cards, eq(cards.id, cardState.cardId))
    .where(eq(cardState.userId, userId))
    .groupBy(cards.cardType);

  const candidates = unseen.rows
    .map((row) => ({ id: row.id, cardType: row.card_type, generation: row.generation, order: row.sort_order, promptKey: row.prompt_key }))
    .filter((card) => inPlayScope(card, scope, ALL_GENERATION_MODES)); // same rule as the SQL, kept as the single source of truth
  return orderNewCards(candidates, Object.fromEntries(introducedByType.map((t) => [t.cardType, t.count])), MODE_IDS);
}

// How many cards are due right now (learning steps, reviews, bank check-ins), for the "due / ahead" indicator.
// Only cards in the Play scope (What to learn), so it matches what Play will show.
async function dueCount(db, userId, now, scheduler, scope) {
  const r = retrievabilitySql(scheduler.curve, now);
  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(cardState)
    .innerJoin(cards, eq(cards.id, cardState.cardId))
    .where(
      and(
        eq(cardState.userId, userId),
        scopeSql(scope),
        sql`((${cardState.tier} = 'rotation' and ${cardState.fsrsState} <> 'new' and ${cardState.dueAt} <= ${now})
          or (${cardState.tier} = 'bank' and ${r} < ${SRS_CONFIG.bank.checkInBelowRetrievability}))`,
      ),
    );
  return count;
}

async function studiedCard(db, userId, cardId) {
  const [row] = await studiedQuery(db, userId).where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId))).limit(1);
  return row ? toStudied(row) : null;
}

// The next thing to show in a session:
//   { step: 'question', card: { id, mode, isWrapup, waitMs, tier, question, preview }, progress }
//   { step: 'empty', canAddNew, canPracticeBank, canFreePlay, progress }   (nothing left to play now)
//   { step: 'done', progress }
// ending: "Review N missed cards" was chosen, so go straight to the wrap-up.
export async function nextForSession(db, userId, session, now, scheduler, { ending = false } = {}) {
  const answers = await sessionAnswers(db, session.id);
  const state = {
    length: lengthOf(session),
    startedAt: session.startedAt,
    answers: answers.map((a) => ({ cardId: a.cardId, correct: a.rating > 1, at: a.at, isWrapup: a.isWrapup })),
    endRequested: ending,
  };
  const progress = {
    label: progressLabel(state, now),
    answered: answers.length,
    dueNow: await dueCount(db, userId, now, scheduler, (await rawSettings(db, userId)).playScope),
    wrapUpPending: wrapUpCards(state).length, // for "Review N missed cards" on End session
  };
  if (session.endedAt) return { step: 'done', progress };

  const step = nextStep(state, now);
  if (step.step === 'done') return { step: 'done', progress };
  if (session.kind === 'free_play') return freePlayNext(db, session, state, step, now, progress);

  let picked;
  let isWrapup = false;
  let waitMs = 0;
  let pastNewLimit = false;
  if (step.step === 'wrapup') {
    const card = await studiedCard(db, userId, step.cardId);
    if (!card) return { step: 'done', progress };
    const mode = PRACTICE_TIER[session.kind] ? `${PRACTICE_TIER[session.kind]}_practice` : card.memory.due <= now ? 'due' : 'ahead';
    picked = { card, mode };
    isWrapup = true;
    waitMs = step.waitMs;
  } else {
    const recent = state.answers.map((a) => ({ cardId: a.cardId, at: a.at }));
    if (PRACTICE_TIER[session.kind]) {
      const tier = PRACTICE_TIER[session.kind];
      // Bank practice: cards whose answer would count toward Mastered today first (see pickPracticeCard).
      const rows = await studiedQuery(db, userId)
        .where(and(eq(cardState.userId, userId), eq(cardState.tier, tier)))
        .orderBy(sql`(case when ${bankCountsTodaySql(now)} then 0 else 1 end)`, retrievabilitySql(scheduler.curve, now), sql`random()`)
        .limit(CANDIDATES_PER_TIER);
      picked = pickPracticeCard({ studied: rows.map(toStudied), tier, recent, now, scheduler });
      if (!picked.card) return { step: 'empty', canAddNew: false, canPracticeBank: false, progress };
    } else {
      const settings = await rawSettings(db, userId);
      const candidates = await playCandidates(db, userId, now, scheduler, settings);
      picked = pickNextCard({ ...candidates, recent, now, scheduler });
      if (!picked.card) return { step: 'empty', canAddNew: picked.canAddNew, canPracticeBank: picked.canPracticeBank, canFreePlay: true, progress };
      const { limit, introducedToday } = candidates.newToday;
      pastNewLimit = picked.mode === 'new' && limit != null && introducedToday >= limit;
      // Working ahead because today's new cards are used up (not because there are none left): say so, and offer more.
      progress.newCardsUsedUp = picked.mode === 'ahead' && newCardsLeft(candidates.newToday) === 0;
    }
  }

  const { card, mode } = picked;
  const memory = card.memory ?? newCardMemory();
  const preview = scheduler.preview(memory, now);
  const question = questionForCard(card.promptKey);
  return {
    step: 'question',
    card: {
      id: card.id,
      mode,
      isWrapup,
      waitMs,
      tier: card.tier ?? 'rotation',
      pastNewLimit,
      // What to call the card in messages like "Banked! Pikachu" (the question itself may hide the name).
      title: getMode(question.mode).describe(card.promptKey)?.title ?? '',
      question,
      // When the card would be due again after each rating (ISO), for "10m / 2d / 6d"; serverNow avoids clock skew.
      preview: Object.fromEntries(Object.entries(preview).map(([rating, due]) => [rating, due.toISOString()])),
      serverNow: now.toISOString(),
    },
    progress: { ...progress, ahead: mode === 'ahead' },
  };
}

// Free Play's next card: a random card from the filter not yet shown in this pass (spec: "Free Play").
// No scheduling, tiers or previews; the card may never have been played in Play.
async function freePlayNext(db, session, state, step, now, progress) {
  let card;
  let waitMs = 0;
  if (step.step === 'wrapup') {
    [card] = await db.select({ id: cards.id, promptKey: cards.promptKey }).from(cards).where(eq(cards.id, step.cardId)).limit(1);
    waitMs = step.waitMs;
  } else {
    const shown = state.answers.filter((a) => !a.isWrapup).map((a) => a.cardId);
    const poolSize = await db.$count(cards, scopeSql(session.filter));
    const skip = [...shownThisPass(shown, poolSize)];
    // Never the same card twice in a row, even across passes (unless it's the only one).
    if (poolSize > 1 && shown.length) skip.push(shown.at(-1));
    [card] = await db
      .select({ id: cards.id, promptKey: cards.promptKey })
      .from(cards)
      .where(sql`${scopeSql(session.filter)} and ${cards.id} <> all(${sql.param(skip)}::int[])`)
      .orderBy(sql`random()`)
      .limit(1);
  }
  if (!card) return { step: 'done', progress };

  const question = questionForCard(card.promptKey);
  return {
    step: 'question',
    card: {
      id: card.id,
      mode: 'free_play',
      isWrapup: step.step === 'wrapup',
      waitMs,
      title: getMode(question.mode).describe(card.promptKey)?.title ?? '',
      question,
      preview: null,
      serverNow: now.toISOString(),
    },
    progress: { ...progress, ahead: false },
  };
}

// ---------------------------------------------------------------------------------------------
// Answering

// Records yesterday's tier counts the first time anything changes on a new day (spec: daily_tier_snapshot):
// an answer, a manual tier action or an undo.
export async function ensureYesterdaySnapshot(tx, userId, now) {
  const yesterday = addDays(dayKey(now, SRS_CONFIG.timeZone), -1);
  const [existing] = await tx
    .select({ day: dailyTierSnapshot.day })
    .from(dailyTierSnapshot)
    .where(and(eq(dailyTierSnapshot.userId, userId), eq(dailyTierSnapshot.day, yesterday)))
    .limit(1);
  if (existing) return;
  await tx.execute(sql`
    insert into ${dailyTierSnapshot} (user_id, day, unseen, rotation, bank, mastered)
    select ${userId}, ${yesterday}::date,
      (select count(*) from ${cards} where ${cards.active}) - count(*),
      count(*) filter (where ${cardState.tier} = 'rotation'),
      count(*) filter (where ${cardState.tier} = 'bank'),
      count(*) filter (where ${cardState.tier} = 'mastered')
    from ${cardState} join ${cards} on ${cards.id} = ${cardState.cardId} and ${cards.active}
    where ${cardState.userId} = ${userId}
    on conflict do nothing`);
}

// One answer, all or nothing: card_state and review_log change together (spec: "one transaction").
// Returns { logId, correct, transition, undo }.
export async function recordAnswer(db, { userId, session, cardId, rating, mode, isWrapup, answerMs, now, scheduler }) {
  return db.transaction(async (tx) => {
    const [card] = await tx.select({ id: cards.id }).from(cards).where(and(eq(cards.id, cardId), eq(cards.active, true))).limit(1);
    if (!card) throw Object.assign(new Error('Unknown card'), { status: 400 });

    await ensureYesterdaySnapshot(tx, userId, now);

    // Lock the row so two devices answering the same card at once can't lose an update.
    const [row] = await tx
      .select()
      .from(cardState)
      .where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId)))
      .for('update');
    const current = row ? cardFromRow(row) : { ...newTierFields(), memory: newCardMemory() };
    const result = reviewCard(current, rating, now, { scheduler });

    const values = { ...rowFromCard(result.card), updatedAt: now };
    await tx
      .insert(cardState)
      .values({ userId, cardId, ...values })
      .onConflictDoUpdate({ target: [cardState.userId, cardState.cardId], set: values });
    const [log] = await tx
      .insert(reviewLog)
      .values({ userId, cardId, sessionId: session.id, mode, isWrapup, answerMs, ...result.log })
      .returning({ id: reviewLog.id });

    return { logId: log.id, correct: rating > 1, transition: result.transition, undo: result.undo };
  });
}

// A Free Play answer: logged in review_log (mode 'free_play') with every FSRS and tier "before" value equal to
// its "after" value, and nothing else changes: no card_state row, no tier or counter, no new-card count.
export async function recordFreePlayAnswer(db, { userId, session, cardId, correct, isWrapup, answerMs, now, scheduler }) {
  const [card] = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.id, cardId), eq(cards.active, true))).limit(1);
  if (!card) throw Object.assign(new Error('Unknown card'), { status: 400 });
  const [row] = await db
    .select()
    .from(cardState)
    .where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId)))
    .limit(1);
  const current = row ? cardFromRow(row) : { ...newTierFields(), memory: newCardMemory() };
  const { memory } = current;
  const [log] = await db
    .insert(reviewLog)
    .values({
      userId,
      cardId,
      sessionId: session.id,
      reviewedAt: now,
      rating: correct ? 3 : 1,
      mode: 'free_play',
      fsrsStateBefore: memory.state,
      stabilityBefore: memory.stability,
      stabilityAfter: memory.stability,
      difficultyBefore: memory.difficulty,
      difficultyAfter: memory.difficulty,
      retrievabilityAtReview: scheduler.retrievability(memory, now),
      dueBefore: memory.due,
      dueAfter: memory.due,
      tierBefore: current.tier,
      tierAfter: current.tier,
      bankCounterAfter: current.bankCorrectDays,
      isWrapup,
      answerMs,
    })
    .returning({ id: reviewLog.id });
  return { logId: log.id, correct, transition: null, undo: null };
}

const TIERS = ['rotation', 'bank', 'mastered'];
const isDayOrNull = (v) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const isTimeOrNull = (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));

// An undo snapshot sent back by the browser, checked field by field.
export function isTierSnapshot(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    TIERS.includes(value.tier) &&
    isTimeOrNull(value.bankedAt) &&
    isTimeOrNull(value.masteredAt) &&
    Number.isInteger(value.bankCorrectDays) &&
    value.bankCorrectDays >= 0 &&
    isDayOrNull(value.bankLastCounted) &&
    isDayOrNull(value.bankPrevCounted)
  );
}

// Undo of "Banked!" / "Mastered!": only for the card's latest answer, and only while the card is still
// where that answer put it. Restores the tier fields (not FSRS) and logs a card_event.
export async function undoTransition(db, { userId, cardId, logId, undo, now }) {
  return db.transaction(async (tx) => {
    const [latest] = await tx
      .select({ id: reviewLog.id, tierBefore: reviewLog.tierBefore, tierAfter: reviewLog.tierAfter })
      .from(reviewLog)
      .where(and(eq(reviewLog.userId, userId), eq(reviewLog.cardId, cardId), sql`${reviewLog.mode} <> 'free_play'`))
      .orderBy(desc(reviewLog.id))
      .limit(1);
    const [row] = await tx
      .select({ tier: cardState.tier })
      .from(cardState)
      .where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId)))
      .for('update');
    const ok =
      latest &&
      row &&
      latest.id === logId &&
      ['bank', 'mastered'].includes(latest.tierAfter) &&
      latest.tierBefore !== latest.tierAfter &&
      row.tier === latest.tierAfter &&
      undo.tier === latest.tierBefore;
    if (!ok) throw Object.assign(new Error('That change can no longer be undone'), { status: 409 });
    await ensureYesterdaySnapshot(tx, userId, now);

    const { tier, bankedAt, masteredAt, bankCorrectDays, bankLastCounted, bankPrevCounted } = tierSnapshotFromJson(undo);
    await tx
      .update(cardState)
      .set({ tier, bankedAt, masteredAt, bankCorrectDays, bankLastCounted, bankPrevCounted, updatedAt: now })
      .where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId)));
    await tx.insert(cardEvents).values({ userId, cardId, at: now, action: 'undo', tierBefore: row.tier, tierAfter: tier, undoTo: undo });
    return { tier };
  });
}

// ---------------------------------------------------------------------------------------------
// Ending and summarizing

export async function endSession(db, userId, sessionId, reason, now) {
  await db
    .update(sessions)
    .set({ endedAt: now, endedReason: reason })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), sql`${sessions.endedAt} is null`));
}

// The end-of-session summary (spec), with each listed card's title and sprite.
export async function sessionSummary(db, userId, session) {
  const answers = await sessionAnswers(db, session.id);
  const cardIds = [...new Set(answers.map((a) => a.cardId))];
  const [cardRows, undos] = cardIds.length
    ? await Promise.all([
        db.select({ id: cards.id, cardType: cards.cardType, payload: cards.payload }).from(cards).where(inArray(cards.id, cardIds)),
        db
          .select({ cardId: cardEvents.cardId, at: cardEvents.at })
          .from(cardEvents)
          .where(and(eq(cardEvents.userId, userId), eq(cardEvents.action, 'undo'), inArray(cardEvents.cardId, cardIds), sql`${cardEvents.at} >= ${session.startedAt}`)),
      ])
    : [[], []];

  // An answer's tier change was undone if an undo for that card came after it and before the card's next answer.
  const undone = (answer, index) => {
    const next = answers.slice(index + 1).find((a) => a.cardId === answer.cardId);
    return undos.some((u) => u.cardId === answer.cardId && u.at >= answer.at && (!next || u.at < next.at));
  };
  const summary = summarize(
    answers.map((a, i) => ({ cardId: a.cardId, correct: a.rating > 1, mode: a.mode, tierBefore: a.tierBefore, tierAfter: a.tierAfter, undone: undone(a, i) })),
  );
  const info = new Map(cardRows.map((c) => [c.id, { cardId: c.id, cardType: c.cardType, title: c.payload.title, sprite: c.payload.sprite ?? null }]));
  const describe = (ids) => ids.map((id) => info.get(id)).filter(Boolean);
  return {
    kind: session.kind,
    length: lengthOf(session),
    answered: summary.answered,
    percentCorrect: summary.percentCorrect,
    newLearned: summary.newLearned,
    banked: describe(summary.banked),
    mastered: describe(summary.mastered),
    backToRotation: describe(summary.backToRotation),
    missed: describe(summary.missed),
    // Free Play: accuracy by mode for this session (spec: "Free Play summary").
    ...(session.kind === 'free_play' && {
      byType: accuracyByType(answers.map((a) => ({ cardType: info.get(a.cardId)?.cardType, correct: a.rating > 1 }))).map((row) => ({
        ...row,
        label: MODE_LABELS.get(row.cardType) ?? row.cardType,
      })),
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Overview for the home screen

export async function playOverview(db, userId, now, scheduler) {
  const settings = await rawSettings(db, userId);
  const [today, due, tiers, [{ bankReady }]] = await Promise.all([
    newToday(db, userId, now, settings),
    dueCount(db, userId, now, scheduler, settings.playScope),
    db
      .select({ tier: cardState.tier, count: sql`count(*)`.mapWith(Number) })
      .from(cardState)
      .where(eq(cardState.userId, userId))
      .groupBy(cardState.tier),
    db
      .select({ bankReady: sql`count(*)`.mapWith(Number) })
      .from(cardState)
      .where(and(eq(cardState.userId, userId), bankCountsTodaySql(now))),
  ]);
  const counts = Object.fromEntries(tiers.map((t) => [t.tier, t.count]));
  return {
    dueNow: due,
    newLeft: finiteOrNull(newCardsLeft(today)), // null = no daily limit
    newLimit: today.limit,
    newIntroducedToday: today.introducedToday,
    rotation: counts.rotation ?? 0,
    bank: counts.bank ?? 0,
    mastered: counts.mastered ?? 0,
    // Banked cards a correct answer would move toward Mastered today (Home's "Practice the bank" nudge).
    bankReady,
  };
}
