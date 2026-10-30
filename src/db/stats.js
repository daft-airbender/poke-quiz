// Everything the Progress screen shows (spec: "Progress screen"), aggregated in SQL so only small results
// leave the database. Days are New York calendar days; weeks start on Monday.
import { and, asc, eq, sql } from 'drizzle-orm';
import { listModes } from '../quiz/modes/index.js';
import { SRS_CONFIG } from '../srs/config.js';
import { addDays, dayKey } from '../srs/days.js';
import { currentStreak, tierCountsByDay, weekOf } from '../srs/stats.js';
import { cardEvents, cards, cardState, dailyTierSnapshot, reviewLog } from './schema.js';

const TZ = SRS_CONFIG.timeZone;
const CALENDAR_DAYS = 371; // 53 weeks
const MOST_MISSED = 10;
const MODE_IDS = listModes().map((m) => m.id);

// As 'YYYY-MM-DD' text: a Postgres date would arrive as a JS Date at the server's local midnight.
const nyDay = (column) => sql`(${column} at time zone ${TZ})::date::text`;
const nyWeek = (column) => sql`date_trunc('week', ${column} at time zone ${TZ})::date::text`;

// The tier changes that rebuild daily_tier_snapshot: every scheduled answer and every card_event, in time order.
async function tierChanges(db, userId) {
  const result = await db.execute(sql`
    select card_id, at, tier_after from (
      select ${reviewLog.cardId} as card_id, ${reviewLog.reviewedAt} as at, ${reviewLog.tierAfter} as tier_after, 0 as kind, ${reviewLog.id} as id
      from ${reviewLog} where ${reviewLog.userId} = ${userId} and ${reviewLog.mode} <> 'free_play'
      union all
      select ${cardEvents.cardId}, ${cardEvents.at}, ${cardEvents.tierAfter}, 1, ${cardEvents.id}
      from ${cardEvents} where ${cardEvents.userId} = ${userId}
    ) changes order by at, kind, id`);
  return result.rows.map((row) => ({ day: dayKey(new Date(row.at), TZ), cardId: row.card_id, tierAfter: row.tier_after }));
}

// daily_tier_snapshot rebuilt from the logs, for every day from the first change through yesterday.
export async function rebuiltSnapshots(db, userId, now) {
  const [changes, totalCards] = await Promise.all([tierChanges(db, userId), db.$count(cards, eq(cards.active, true))]);
  if (!changes.length) return [];
  return tierCountsByDay(changes, totalCards, addDays(changes[0].day, -1), addDays(dayKey(now, TZ), -1));
}

// Repairs or backfills daily_tier_snapshot from the logs. Returns how many days were written.
export async function rebuildSnapshots(db, userId, now) {
  const rows = await rebuiltSnapshots(db, userId, now);
  if (rows.length) {
    await db
      .insert(dailyTierSnapshot)
      .values(rows.map((row) => ({ userId, ...row })))
      .onConflictDoUpdate({
        target: [dailyTierSnapshot.userId, dailyTierSnapshot.day],
        set: { unseen: sql`excluded.unseen`, rotation: sql`excluded.rotation`, bank: sql`excluded.bank`, mastered: sql`excluded.mastered` },
      });
  }
  return rows.length;
}

// { modes: [{ id, label, unseen, rotation, bank, mastered }], generations: [{ generation, ... }] }: cards per tier
// by card type and by generation. Cards without a generation (type-chart cards) only count by type.
async function categories(db, userId) {
  const tierCounts = sql`count(*) filter (where ${cardState.cardId} is null)::int as unseen,
    count(*) filter (where ${cardState.tier} = 'rotation')::int as rotation,
    count(*) filter (where ${cardState.tier} = 'bank')::int as bank,
    count(*) filter (where ${cardState.tier} = 'mastered')::int as mastered`;
  const from = sql`from ${cards} left join ${cardState} on ${cardState.cardId} = ${cards.id} and ${cardState.userId} = ${userId}
    where ${cards.active}`;
  const [byMode, byGen] = await Promise.all([
    db.execute(sql`select ${cards.cardType} as key, ${tierCounts} ${from} group by 1`),
    db.execute(sql`select ${cards.generation} as key, ${tierCounts} ${from} and ${cards.generation} is not null group by 1 order by 1`),
  ]);
  const labels = new Map(listModes().map((m) => [m.id, m.label]));
  const modeRows = new Map(byMode.rows.map((r) => [r.key, r]));
  return {
    modes: MODE_IDS.filter((id) => modeRows.has(id)).map((id) => {
      const { key, ...counts } = modeRows.get(id);
      return { id, label: labels.get(id), ...counts };
    }),
    generations: byGen.rows.map(({ key, ...counts }) => ({ generation: key, ...counts })),
  };
}

// True recall rate per week: answers that were real tests of memory (due reviews and bank check-ins, not wrap-ups,
// at least a day after that card's previous answer of any kind). [{ week, qualifying, correct }]
async function recallByWeek(db, userId) {
  const result = await db.execute(sql`
    select week, count(*)::int as qualifying, count(*) filter (where rating > 1)::int as correct from (
      select ${nyWeek(reviewLog.reviewedAt)} as week, ${reviewLog.rating} as rating, ${reviewLog.mode} as mode,
        ${reviewLog.isWrapup} as is_wrapup, ${reviewLog.reviewedAt} as at,
        lag(${reviewLog.reviewedAt}) over (partition by ${reviewLog.cardId} order by ${reviewLog.reviewedAt}, ${reviewLog.id}) as previous
      from ${reviewLog} where ${reviewLog.userId} = ${userId}
    ) answers
    where mode in ('due', 'bank_checkin') and not is_wrapup and previous is not null and at - previous >= interval '1 day'
    group by week order by week`);
  return result.rows.map((row) => ({ week: row.week, qualifying: row.qualifying, correct: row.correct }));
}

// Answers per day: [{ day, play, freePlay, correct }], for the calendar (last 53 weeks) and the streak (all time).
async function activityByDay(db, userId) {
  const result = await db.execute(sql`
    select ${nyDay(reviewLog.reviewedAt)} as day,
      count(*) filter (where ${reviewLog.mode} <> 'free_play')::int as play,
      count(*) filter (where ${reviewLog.mode} = 'free_play')::int as free_play,
      count(*) filter (where ${reviewLog.rating} > 1)::int as correct
    from ${reviewLog} where ${reviewLog.userId} = ${userId}
    group by 1 order by 1`);
  return result.rows.map((row) => ({ day: row.day, play: row.play, freePlay: row.free_play, correct: row.correct }));
}

// Free Play's own numbers: weekly accuracy, accuracy by card type and generation, and the most-missed cards.
async function freePlayStats(db, userId) {
  const freePlay = sql`${reviewLog.userId} = ${userId} and ${reviewLog.mode} = 'free_play'`;
  const [weeks, byMode, byGen, missed] = await Promise.all([
    db.execute(sql`select ${nyWeek(reviewLog.reviewedAt)} as week, count(*)::int as answered,
      count(*) filter (where ${reviewLog.rating} > 1)::int as correct
      from ${reviewLog} where ${freePlay} group by 1 order by 1`),
    db.execute(sql`select ${cards.cardType} as key, count(*)::int as answered, count(*) filter (where ${reviewLog.rating} > 1)::int as correct
      from ${reviewLog} join ${cards} on ${cards.id} = ${reviewLog.cardId} where ${freePlay} group by 1`),
    db.execute(sql`select ${cards.generation} as key, count(*)::int as answered, count(*) filter (where ${reviewLog.rating} > 1)::int as correct
      from ${reviewLog} join ${cards} on ${cards.id} = ${reviewLog.cardId} where ${freePlay} and ${cards.generation} is not null group by 1 order by 1`),
    db.execute(sql`select ${cards.id} as id, ${cards.cardType} as card_type, ${cards.payload} as payload,
        count(*) filter (where ${reviewLog.rating} = 1)::int as missed, count(*)::int as answered
      from ${reviewLog} join ${cards} on ${cards.id} = ${reviewLog.cardId} where ${freePlay}
      group by 1, 2, 3 having count(*) filter (where ${reviewLog.rating} = 1) > 0
      order by missed desc, answered desc limit ${MOST_MISSED}`),
  ]);
  const labels = new Map(listModes().map((m) => [m.id, m.label]));
  return {
    weeks: weeks.rows.map((r) => ({ week: r.week, answered: r.answered, correct: r.correct })),
    byMode: MODE_IDS.map((id) => byMode.rows.find((r) => r.key === id))
      .filter(Boolean)
      .map((r) => ({ id: r.key, label: labels.get(r.key), answered: r.answered, correct: r.correct })),
    byGeneration: byGen.rows.map((r) => ({ generation: r.key, answered: r.answered, correct: r.correct })),
    mostMissed: missed.rows.map((r) => ({
      id: r.id,
      cardType: r.card_type,
      title: r.payload.title,
      sprite: r.payload.sprite ?? null,
      missed: r.missed,
      answered: r.answered,
    })),
  };
}

// Everything for the Progress screen in one response.
export async function progressStats(db, userId, now) {
  const today = dayKey(now, TZ);
  const thisWeek = weekOf(today);
  const [tiers, snapshots, recall, activity, cats, fp, [masteredThisWeek]] = await Promise.all([
    db.execute(sql`select
        (select count(*) from ${cards} where ${cards.active})::int as total,
        count(*) filter (where ${cardState.tier} = 'rotation')::int as rotation,
        count(*) filter (where ${cardState.tier} = 'bank')::int as bank,
        count(*) filter (where ${cardState.tier} = 'mastered')::int as mastered
      from ${cardState} join ${cards} on ${cards.id} = ${cardState.cardId} and ${cards.active}
      where ${cardState.userId} = ${userId}`),
    db
      .select({ day: dailyTierSnapshot.day, unseen: dailyTierSnapshot.unseen, rotation: dailyTierSnapshot.rotation, bank: dailyTierSnapshot.bank, mastered: dailyTierSnapshot.mastered })
      .from(dailyTierSnapshot)
      .where(eq(dailyTierSnapshot.userId, userId))
      .orderBy(asc(dailyTierSnapshot.day)),
    recallByWeek(db, userId),
    activityByDay(db, userId),
    categories(db, userId),
    freePlayStats(db, userId),
    db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(cardState)
      .where(and(eq(cardState.userId, userId), eq(cardState.tier, 'mastered'), sql`${nyDay(cardState.masteredAt)} >= ${thisWeek}`)),
  ]);

  const { total, rotation, bank, mastered } = tiers.rows[0];
  const current = { day: today, unseen: total - rotation - bank - mastered, rotation, bank, mastered };
  const streak = currentStreak(activity.map((a) => a.day), today);
  const calendarStart = addDays(today, -(CALENDAR_DAYS - 1));
  const recallThisWeek = recall.find((w) => w.week === thisWeek) ?? { week: thisWeek, qualifying: 0, correct: 0 };
  const fpWeek = fp.weeks.find((w) => w.week === thisWeek) ?? { answered: 0, correct: 0 };
  const fpAll = fp.weeks.reduce((sum, w) => ({ answered: sum.answered + w.answered, correct: sum.correct + w.correct }), { answered: 0, correct: 0 });

  return {
    today,
    thisWeek,
    headline: {
      mastered,
      masteredThisWeek: masteredThisWeek.count,
      streak: streak.length,
      recallThisWeek,
    },
    // Daily tier counts: stored snapshots (end of each past day) plus today's live counts.
    growth: [...snapshots.filter((s) => s.day < today), current],
    recall,
    categories: cats,
    activity: activity.filter((a) => a.day >= calendarStart),
    streakDays: streak.days.filter((d) => d >= calendarStart),
    freePlay: { ...fp, thisWeek: fpWeek, allTime: fpAll },
  };
}
