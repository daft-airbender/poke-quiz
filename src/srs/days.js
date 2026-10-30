// Calendar days in one time zone (America/New_York by default), as 'YYYY-MM-DD' strings.
// The SRS counts "days" this way everywhere: the daily new-card limit, bank correct days, streaks.
import { SRS_CONFIG } from './config.js';

const formatters = new Map();

// The calendar day `date` falls on in `timeZone`, e.g. '2026-11-01'.
export function dayKey(date, timeZone = SRS_CONFIG.timeZone) {
  if (!formatters.has(timeZone)) {
    // en-CA formats dates as YYYY-MM-DD.
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  return formatters.get(timeZone).format(date);
}

// Whole calendar days from day `a` to day `b` (both 'YYYY-MM-DD'); negative if b is earlier.
export function daysBetween(a, b) {
  const toUtc = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((toUtc(b) - toUtc(a)) / (24 * 60 * 60 * 1000));
}

// The day `n` days after `key` (negative for before), e.g. addDays('2026-11-01', -1) -> '2026-10-31'.
export function addDays(key, n) {
  const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + n));
  return date.toISOString().slice(0, 10);
}
