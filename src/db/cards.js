import { and, eq, sql } from 'drizzle-orm';
import { buildCatalog } from '../srs/catalog.js';
import { cards } from './schema.js';

const CHUNK = 1000;

// Makes the cards table match the mode registry: inserts new cards, updates changed ones, and marks
// cards whose key no longer exists as inactive (kept, since review history points at them).
// Idempotent; runs after migrations on every deploy. Returns { total, changed, inactive }.
export async function syncCards(db) {
  const catalog = buildCatalog();
  return db.transaction(async (tx) => {
    let changed = 0;
    for (let i = 0; i < catalog.length; i += CHUNK) {
      const result = await tx
        .insert(cards)
        .values(catalog.slice(i, i + CHUNK).map((card) => ({ ...card, active: true })))
        .onConflictDoUpdate({
          target: cards.promptKey,
          set: {
            cardType: sql`excluded.card_type`,
            payload: sql`excluded.payload`,
            generation: sql`excluded.generation`,
            sortOrder: sql`excluded.sort_order`,
            active: true,
          },
          // Skip rows that haven't changed, so a normal deploy writes nothing.
          setWhere: sql`(${cards.cardType}, ${cards.payload}, ${cards.generation}, ${cards.sortOrder}, ${cards.active})
            is distinct from (excluded.card_type, excluded.payload, excluded.generation, excluded.sort_order, true)`,
        });
      changed += result.rowCount;
    }
    const keys = catalog.map((card) => card.promptKey);
    const retired = await tx
      .update(cards)
      .set({ active: false })
      // sql.param sends the keys as one array parameter (a bare array would become one parameter per key).
      .where(and(eq(cards.active, true), sql`${cards.promptKey} <> all(${sql.param(keys)}::text[])`));
    return { total: catalog.length, changed, inactive: retired.rowCount };
  });
}
