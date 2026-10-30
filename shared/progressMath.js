// Small date and series helpers for the Progress screen, shared by the server (src/srs/stats.js) and the
// browser (public/screens/Progress.js), so both group and fill the same way. Days are 'YYYY-MM-DD'.

const DAY_MS = 24 * 60 * 60 * 1000;

export function shiftDay(day, n) {
  return new Date(new Date(`${day}T12:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

// The Monday of the week `day` falls in.
export function weekOf(day) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftDay(day, -((weekday + 6) % 7));
}

// Daily rows from `from` to `to` with gaps carried forward (no activity that day = no change).
export function fillDays(rows, from, to) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const filled = [];
  let last = null;
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    last = byDay.get(day) ?? (last && { ...last, day });
    if (last) filled.push(last);
  }
  return filled;
}

// Only each week's last day, for ranges longer than three months.
export function lastDayPerWeek(rows) {
  const byWeek = new Map();
  for (const row of rows) byWeek.set(weekOf(row.day), row);
  return [...byWeek.values()];
}

// Activity calendar shading: 0 for no answers, then 1-4 by my own range (quartiles of the days I played),
// so a light week still shows its shape. Returns a function count -> level.
export function activityLevels(counts) {
  const sorted = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (!sorted.length) return () => 0;
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const cuts = [at(0.25), at(0.5), at(0.75)];
  return (count) => (count <= 0 ? 0 : 1 + cuts.filter((cut) => count > cut).length);
}
