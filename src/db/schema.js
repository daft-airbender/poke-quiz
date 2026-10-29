import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // User preferences (round length, generations, ...), synced across devices.
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// One row per (user, question), e.g. "name:6", "type:25", "matchup:fire>grass/steel".
export const progress = pgTable(
  'progress',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionKey: text('question_key').notNull(),
    mode: text('mode').notNull(),
    timesSeen: integer('times_seen').notNull().default(0),
    timesCorrect: integer('times_correct').notNull().default(0),
    // Current consecutive-correct count.
    streak: integer('streak').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (table) => [unique('progress_user_question_unique').on(table.userId, table.questionKey)],
);

// History: one row per completed round.
export const quizSessions = pgTable('quiz_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(),
  total: integer('total').notNull(),
  correct: integer('correct').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
});
