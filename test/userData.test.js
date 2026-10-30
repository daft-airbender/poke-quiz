import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTableName } from 'drizzle-orm';
import { tablesWithUserId, USER_DATA_TABLES } from '../src/db/userData.js';

// "Reset all progress" must cover every per-user table, including ones added later (e.g. the SRS tables).
test('reset covers every table with a user_id column', () => {
  const names = (tables) => tables.map(getTableName).sort();
  assert.deepEqual(names(USER_DATA_TABLES), names(tablesWithUserId()), 'add the new table to USER_DATA_TABLES in src/db/userData.js');
});
