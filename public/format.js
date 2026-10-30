// Small display helpers shared by the screens.

// "10m", "6h", "2d", "3mo", "1.5y": how far `to` is from `from` (both ISO strings or Dates).
export function formatInterval(from, to) {
  const minutes = Math.max(1, Math.round((new Date(to) - new Date(from)) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  return `${years < 10 ? Math.round(years * 10) / 10 : Math.round(years)}y`;
}

// A session length for buttons and labels: "25 questions", "10 min", "Endless".
export function lengthLabel(length) {
  if (length.type === 'count') return `${length.value} questions`;
  if (length.type === 'timer') return `${length.value} min`;
  return 'Endless';
}

// "3:41" from milliseconds.
export function clock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export const KIND_LABELS = { play: 'Play', bank_practice: 'Bank practice', mastered_practice: 'Mastered practice', free_play: 'Free Play' };
