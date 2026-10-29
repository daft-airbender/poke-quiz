// Simple spaced repetition: how likely a question is to be picked for a round.
// Weights are relative; a question with weight 10 is ten times as likely as one with weight 1.
//
// record: the progress row { timesSeen, timesCorrect, streak, lastSeenAt }, or undefined if never seen.

const DAY_MS = 24 * 60 * 60 * 1000;

export const NEW_WEIGHT = 1;
const MISSED_WEIGHT = 10;
// While a question is resting (see below) it keeps only this fraction of its weight.
const RESTING_FACTOR = 0.05;

export function weight(record, now = Date.now()) {
  if (!record || record.timesSeen === 0) return NEW_WEIGHT;

  const missRate = 1 - record.timesCorrect / record.timesSeen;

  // Last answer was wrong: bring it back soon, more so if it's often missed (10 to 20).
  if (record.streak === 0) return MISSED_WEIGHT * (1 + missRate);

  // Answered right lately. Each correct answer in a row doubles how long it rests
  // (1, 2, 4, 8… days). Once rested it's due again, on par with a new question (1 to 4).
  const due = NEW_WEIGHT + 3 * missRate;
  const restDays = 2 ** (record.streak - 1);
  const daysSince = (now - new Date(record.lastSeenAt).getTime()) / DAY_MS;
  return daysSince < restDays ? due * RESTING_FACTOR : due;
}
