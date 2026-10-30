// Calculations behind the Progress screen (spec: "Progress screen"). Pure: the database layer (src/db/stats.js)
// loads the rows. Days are New York calendar days ('YYYY-MM-DD'), weeks start on Monday.
import { addDays } from './days.js';

// Grouping, filling and shading helpers shared with the browser.
export { activityLevels, fillDays, lastDayPerWeek, weekOf } from '../../shared/progressMath.js';

// Card counts per tier at the end of each day from `from` to `to` (inclusive), replayed from tier changes.
// changes: [{ day, cardId, tierAfter }] in time order: every scheduled answer (review_log, not Free Play) and every
// card_event. A card's first change takes it out of Unseen. Rebuilds daily_tier_snapshot (spec: "rebuildable").
export function tierCountsByDay(changes, totalCards, from, to) {
  const tierOf = new Map();
  const counts = { rotation: 0, bank: 0, mastered: 0 };
  const rows = [];
  let i = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (; i < changes.length && changes[i].day <= day; i++) {
      const { cardId, tierAfter } = changes[i];
      const before = tierOf.get(cardId);
      if (before) counts[before]--;
      counts[tierAfter]++;
      tierOf.set(cardId, tierAfter);
    }
    rows.push({ day, unseen: totalCards - tierOf.size, ...counts });
  }
  return rows;
}

// Consecutive days with at least one answer, ending today, or yesterday if I haven't played yet today.
// days: the days with any answer (Play or Free Play). Returns { length, days: [the streak's days] }.
export function currentStreak(days, today) {
  const played = new Set(days);
  let end = played.has(today) ? today : addDays(today, -1);
  const streak = [];
  while (played.has(end)) {
    streak.push(end);
    end = addDays(end, -1);
  }
  return { length: streak.length, days: streak.reverse() };
}

export const LOW_DATA = 10; // weeks with fewer qualifying answers are shown faded, labeled "low data"
