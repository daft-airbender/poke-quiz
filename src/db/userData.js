import { eq, getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

// Every table that holds a user's progress or history. "Reset all progress" deletes the user's rows
// from each of these; the login itself (users) and its settings are kept.
// Rows are deleted in this order, so list tables that reference others first.
// Adding a table with a user_id column? List it here: test/userData.test.js fails until you do.
export const USER_DATA_TABLES = [schema.progress, schema.quizSessions];

// Tables (other than users) that have a userId column, found from the schema itself.
export function tablesWithUserId() {
  return Object.values(schema).filter((value) => is(value, PgTable) && value !== schema.users && 'userId' in getTableColumns(value));
}

// Deletes all of one user's progress and history in a single transaction.
// Returns how many rows were deleted per table, e.g. { progress: 120, quiz_sessions: 8 }.
export async function deleteUserData(db, userId) {
  return db.transaction(async (tx) => {
    const deleted = {};
    for (const table of USER_DATA_TABLES) {
      const result = await tx.delete(table).where(eq(table.userId, userId));
      deleted[getTableName(table)] = result.rowCount;
    }
    return deleted;
  });
}
