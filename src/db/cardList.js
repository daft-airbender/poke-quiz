// Browsing cards and changing their tier by hand (spec: "Bank and Mastered" → "Screens and actions", "Leeches").
// Lists are paged and filtered in SQL; retrievability is computed there too (see retrievabilitySql).
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { SRS_CONFIG } from '../srs/config.js';
import { cardFromRow, rowFromCard } from '../srs/rows.js';
import { newCardMemory } from '../srs/scheduler.js';
import { ACTIONS_BY_TIER, manualTierChange, newTierFields } from '../srs/tiers.js';
import { cardEvents, cards, cardState } from './schema.js';
import { ensureYesterdaySnapshot, retrievabilitySql } from './srs.js';

export const LIST_TIERS = ['all', 'unseen', 'rotation', 'bank', 'mastered', 'trouble'];
export const SORTS = ['fading', 'strongest', 'name'];
export const PAGE_SIZE = 50;
// Bulk actions touch at most this many cards at once (a whole mode is 1,025 or, for Effectiveness (dual), 2,448).
const BULK_MAX = 3000;
const CHUNK = 500;

// Lowercase without accents, in SQL, so "flabebe" finds Flabébé (the only accented Pokémon name).
const plainTitle = sql`translate(lower(${cards.payload} ->> 'title'), 'éèêëáàâäíìîïóòôöúùûüç', 'eeeeaaaaiiiioooouuuuc')`;
const plain = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// The WHERE clause for a list: { tier, mode, gen, q } (all optional; tier defaults to 'all').
function listWhere({ tier = 'all', mode, gen, q }) {
  const conditions = [eq(cards.active, true)];
  if (mode) conditions.push(eq(cards.cardType, mode));
  if (gen) conditions.push(eq(cards.generation, gen));
  if (q) conditions.push(sql`${plainTitle} like ${`%${plain(q).replace(/[%_\\]/g, '\\$&')}%`}`);
  if (tier === 'unseen') conditions.push(sql`${cardState.cardId} is null`);
  else if (tier === 'trouble') conditions.push(eq(cardState.isLeech, true));
  else if (tier !== 'all') conditions.push(eq(cardState.tier, tier));
  return and(...conditions);
}

// Cards joined with this user's state (null for unseen ones).
function joined(db, userId, columns) {
  return db
    .select(columns)
    .from(cards)
    .leftJoin(cardState, and(eq(cardState.cardId, cards.id), eq(cardState.userId, userId)))
    .$dynamic();
}

// One page of cards: { total, cards: [{ id, cardType, title, sprite, generation, tier, r, isLeech }] }.
// tier is 'unseen' for cards never answered; r (recall chance now) is null for those.
export async function listCards(db, userId, filters, { sort = 'fading', offset = 0, now, scheduler }) {
  const r = retrievabilitySql(scheduler.curve, now);
  const where = listWhere(filters);
  const order = {
    fading: sql`(case when ${cardState.cardId} is null then 1 else 0 end), ${r} asc, ${cards.id}`,
    strongest: sql`(case when ${cardState.cardId} is null then 1 else 0 end), ${r} desc, ${cards.id}`,
    name: sql`${plainTitle}, ${cards.sortOrder}, ${cards.id}`,
  }[sort];
  const [rows, [{ total }]] = await Promise.all([
    joined(db, userId, {
      id: cards.id,
      cardType: cards.cardType,
      payload: cards.payload,
      generation: cards.generation,
      tier: cardState.tier,
      isLeech: cardState.isLeech,
      r: sql`case when ${cardState.cardId} is null then null else ${r} end`.mapWith((v) => (v === null ? null : Number(v))),
    })
      .where(where)
      .orderBy(order)
      .limit(PAGE_SIZE)
      .offset(offset),
    joined(db, userId, { total: sql`count(*)`.mapWith(Number) }).where(where),
  ]);
  return {
    total,
    cards: rows.map((row) => ({
      id: row.id,
      cardType: row.cardType,
      title: row.payload.title,
      sprite: row.payload.sprite ?? null,
      generation: row.generation,
      tier: row.tier ?? 'unseen',
      isLeech: row.isLeech ?? false,
      r: row.r,
    })),
  };
}

// Everything the card detail view shows, or null if there's no such card.
export async function cardDetails(db, userId, cardId, { now, scheduler }) {
  const [row] = await joined(db, userId, { card: cards, state: cardState })
    .where(eq(cards.id, cardId))
    .limit(1);
  if (!row) return null;
  const { card, state } = row;
  const base = { id: card.id, cardType: card.cardType, generation: card.generation, active: card.active, ...card.payload };
  if (!state) return { ...base, tier: 'unseen', actions: ACTIONS_BY_TIER.unseen };
  const { memory, ...tierFields } = cardFromRow(state);
  return {
    ...base,
    tier: tierFields.tier,
    actions: ACTIONS_BY_TIER[tierFields.tier],
    isLeech: tierFields.isLeech,
    r: scheduler.retrievability(memory, now),
    stability: memory.stability,
    difficulty: memory.difficulty,
    due: memory.due,
    lastReviewAt: memory.lastReviewAt,
    reps: memory.reps,
    lapses: memory.lapses,
    fsrsState: memory.state,
    bankCorrectDays: tierFields.bankCorrectDays,
    requiredCorrectDays: SRS_CONFIG.mastery.requiredCorrectDays,
  };
}

// Applies a manual action to cards, skipping any it doesn't apply to (e.g. "restore" on an unseen card).
// One transaction: card_state upserts and a card_events row per card changed. Returns { changed }.
async function applyAction(db, userId, cardIds, action, now) {
  if (!cardIds.length) return { changed: 0 };
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(cardState)
      .where(and(eq(cardState.userId, userId), inArray(cardState.cardId, cardIds)))
      .for('update');
    await ensureYesterdaySnapshot(tx, userId, now);
    const byId = new Map(rows.map((row) => [row.cardId, row]));
    const updates = [];
    const events = [];
    for (const cardId of cardIds) {
      const row = byId.get(cardId);
      const tier = row ? row.tier : 'unseen';
      if (!ACTIONS_BY_TIER[tier].includes(action)) continue;
      const before = row ? cardFromRow(row) : { ...newTierFields(), memory: newCardMemory() };
      const after = manualTierChange(before, action, now);
      updates.push({ userId, cardId, ...rowFromCard(after), updatedAt: now });
      events.push({ userId, cardId, at: now, action, tierBefore: before.tier, tierAfter: after.tier });
    }
    // Every card_state column except the key, taken from the new values.
    const set = Object.fromEntries(
      Object.entries(getTableColumns(cardState))
        .filter(([key]) => key !== 'userId' && key !== 'cardId')
        .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
    );
    for (let i = 0; i < updates.length; i += CHUNK) {
      await tx
        .insert(cardState)
        .values(updates.slice(i, i + CHUNK))
        .onConflictDoUpdate({ target: [cardState.userId, cardState.cardId], set });
      await tx.insert(cardEvents).values(events.slice(i, i + CHUNK));
    }
    return { changed: updates.length };
  });
}

export async function actOnCard(db, userId, cardId, action, now) {
  return applyAction(db, userId, [cardId], action, now);
}

// Bulk action on the cards matching a list's filters: all of them, or `count` picked at random.
// Only cards the action applies to are counted, so "Restore 10 random" restores 10.
export async function actOnMatching(db, userId, filters, action, { count = null, now }) {
  const applicable = ACTIONS_BY_TIER;
  const tiers = Object.keys(applicable).filter((tier) => applicable[tier].includes(action));
  const tierCondition = sql`coalesce(${cardState.tier}, 'unseen') = any(${sql.param(tiers)}::text[])`;
  const rows = await joined(db, userId, { id: cards.id })
    .where(and(listWhere(filters), tierCondition))
    .orderBy(count ? sql`random()` : cards.id)
    .limit(count ?? BULK_MAX);
  return applyAction(db, userId, rows.map((row) => row.id), action, now);
}
