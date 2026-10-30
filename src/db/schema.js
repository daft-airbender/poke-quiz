import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // User preferences (round length, generations, ...), synced across devices.
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------------------------
// Spaced repetition (see _design_docs/pokemon-quiz-srs-spec.md, "Data model").
// Differences from the spec's sketch: per-user tables have user_id (multi-user-ready),
// settings stay in users.settings, and card_events records manual tier actions and undos so that
// replaying a card's history (review_log + card_events) rebuilds its card_state exactly.

const timestamptz = (name) => timestamp(name, { withTimezone: true });

// One row per quizzable fact, shared by all users. Synced from the mode registry by scripts/sync-cards.js.
export const cards = pgTable(
  'cards',
  {
    id: serial('id').primaryKey(),
    cardType: text('card_type').notNull(), // a mode id, e.g. 'name-choice', 'effectiveness-dual'
    promptKey: text('prompt_key').notNull().unique(), // the mode's question key, e.g. 'effectiveness-dual:fire>grass/steel'
    payload: jsonb('payload').notNull(), // what lists show for it: the mode's describe(key) (title, sprite, answer, ...)
    generation: integer('generation'), // null for cards not tied to a Pokémon (type-chart cards)
    sortOrder: integer('sort_order').notNull(), // catalog order within its type (Pokédex order for Pokémon cards)
    active: boolean('active').notNull().default(true), // false once a mode stops producing this key (history kept)
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('cards_type_idx').on(table.cardType)],
);

// Current memory and tier, one row per (user, card) once the card has been answered. Unseen = no row.
// FSRS state and tier are separate columns so moving between tiers never touches the memory model.
export const cardState = pgTable(
  'card_state',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    fsrsState: text('fsrs_state').notNull().default('new'), // new | learning | review | relearning
    tier: text('tier').notNull().default('rotation'), // rotation | bank | mastered
    bankedAt: timestamptz('banked_at'), // when it last entered the bank
    masteredAt: timestamptz('mastered_at'),
    dueAt: timestamptz('due_at'),
    stability: doublePrecision('stability'),
    difficulty: doublePrecision('difficulty'),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    learningStep: integer('learning_step').notNull().default(0),
    lastReviewAt: timestamptz('last_review_at'),
    isLeech: boolean('is_leech').notNull().default(false),
    bankCorrectDays: integer('bank_correct_days').notNull().default(0), // net counted correct days, kept across trips to rotation
    bankLastCounted: date('bank_last_counted'), // last New York day that counted (+1)
    bankPrevCounted: date('bank_prev_counted'), // the one before, for undoing a same-day +1 on a miss
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.cardId] }),
    index('card_state_user_tier_idx').on(table.userId, table.tier),
    index('card_state_user_due_idx').on(table.userId, table.dueAt),
  ],
);

// One row per play session (Play, Free Play, or practice), for the summary and stats.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // play | free_play | bank_practice | mastered_practice
    startedAt: timestamptz('started_at').notNull().defaultNow(),
    endedAt: timestamptz('ended_at'),
    lengthType: text('length_type').notNull(), // count | timer | endless
    lengthValue: integer('length_value'), // questions or minutes; null for endless
    endedReason: text('ended_reason'), // limit | quit
    filter: jsonb('filter'), // Free Play only: { modes: ids | null, gens: numbers | null } (null = all)
  },
  (table) => [index('sessions_user_started_idx').on(table.userId, table.startedAt)],
);

// Append-only log of every answer, Free Play included. The source of truth for stats, replay,
// and fitting personal FSRS weights later.
export const reviewLog = pgTable(
  'review_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    reviewedAt: timestamptz('reviewed_at').notNull().defaultNow(),
    rating: smallint('rating').notNull(), // 1..4 (Free Play: 1 = wrong, 3 = right)
    mode: text('mode').notNull(), // due | ahead | new | bank_checkin | bank_practice | mastered_practice | free_play
    fsrsStateBefore: text('fsrs_state_before').notNull(),
    stabilityBefore: doublePrecision('stability_before'),
    stabilityAfter: doublePrecision('stability_after'),
    difficultyBefore: doublePrecision('difficulty_before'),
    difficultyAfter: doublePrecision('difficulty_after'),
    retrievabilityAtReview: doublePrecision('retrievability_at_review'), // R just before answering
    dueBefore: timestamptz('due_before'),
    dueAfter: timestamptz('due_after'),
    tierBefore: text('tier_before').notNull(),
    tierAfter: text('tier_after').notNull(),
    bankCounterAfter: integer('bank_counter_after'),
    isWrapup: boolean('is_wrapup').notNull().default(false),
    answerMs: integer('answer_ms'),
  },
  (table) => [
    index('review_log_user_time_idx').on(table.userId, table.reviewedAt),
    index('review_log_user_card_idx').on(table.userId, table.cardId, table.reviewedAt),
    index('review_log_session_idx').on(table.sessionId),
  ],
);

// Tier changes that aren't answers: manual actions (restore, demote, move_to_bank, mark_mastered)
// and undo of a "Banked!" / "Mastered!" message. With review_log, enough to replay a card exactly.
export const cardEvents = pgTable(
  'card_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardId: integer('card_id')
      .notNull()
      .references(() => cards.id),
    at: timestamptz('at').notNull().defaultNow(),
    action: text('action').notNull(), // restore | demote | move_to_bank | mark_mastered | undo
    tierBefore: text('tier_before').notNull(),
    tierAfter: text('tier_after').notNull(),
    undoTo: jsonb('undo_to'), // for 'undo': the tier fields restored
  },
  (table) => [index('card_events_user_card_idx').on(table.userId, table.cardId, table.at)],
);

// Card counts per tier for each New York day, for the Collection growth chart. Rebuildable from the logs.
export const dailyTierSnapshot = pgTable(
  'daily_tier_snapshot',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    unseen: integer('unseen').notNull(),
    rotation: integer('rotation').notNull(),
    bank: integer('bank').notNull(),
    mastered: integer('mastered').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);
