// Rebuilds daily_tier_snapshot (the Collection growth chart) from review_log + card_events, for every user.
// For repairing or backfilling history; normal play writes the snapshots itself.
//
//   npm run rebuild:snapshots
import { getDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { rebuildSnapshots } from '../src/db/stats.js';

const db = getDb();
try {
  for (const { id, username } of await db.select({ id: users.id, username: users.username }).from(users)) {
    console.log(`${username}: ${await rebuildSnapshots(db, id, new Date())} days written`);
  }
} finally {
  await db.$client.end();
}
