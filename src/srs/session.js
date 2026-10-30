// Session length and wrap-up (spec: "Session length"). Pure: a session is plain data the caller keeps.
//
// session: { length, startedAt, answers: [{ cardId, correct, at, isWrapup }], endRequested }
//   length: { type: 'count', value: 10 | 25 | 50 } | { type: 'timer', value: 5 | 10 | 20 (minutes) } | { type: 'endless' }
// Session length never affects scheduling; it only decides when to stop and what to wrap up.
import { SRS_CONFIG } from './config.js';

const MINUTE = 60 * 1000;

// A valid length from (untrusted) input, or null.
export function parseSessionLength(input, config = SRS_CONFIG) {
  const { type, value } = input ?? {};
  if (type === 'endless') return { type };
  if ((type === 'count' || type === 'timer') && config.sessionLengths[type].includes(value)) return { type, value };
  return null;
}

// Play starts with the last length used, or the default the first time.
export function lengthToUse(lastUsed, config = SRS_CONFIG) {
  return parseSessionLength(lastUsed, config) ?? config.defaultSessionLength;
}

// Has the session reached its length? Checked between questions, so a timer never cuts a question off.
// Wrap-up answers don't count toward a question limit; repeats do.
export function limitReached(session, now) {
  const { type, value } = session.length;
  if (type === 'count') return session.answers.filter((a) => !a.isWrapup).length >= value;
  if (type === 'timer') return now - session.startedAt >= value * MINUTE;
  return false;
}

// Cards missed this session and not answered correctly since, that haven't had their one wrap-up showing.
export function wrapUpCards(session) {
  const latest = new Map(); // cardId -> latest answer this session
  const wrapped = new Set();
  for (const answer of session.answers) {
    latest.set(answer.cardId, answer);
    if (answer.isWrapup) wrapped.add(answer.cardId);
  }
  return [...latest.values()].filter((a) => !a.correct && !wrapped.has(a.cardId)).map((a) => a.cardId);
}

// What happens next: { step: 'question' } | { step: 'wrapup', cardId, waitMs } | { step: 'done' }.
// Wrap-up starts when the limit is reached or "Review N missed cards" was chosen (endRequested).
// A wrap-up card that was the last one shown goes after the others; if it's the only one, it waits briefly.
export function nextStep(session, now, config = SRS_CONFIG) {
  if (!session.endRequested && !limitReached(session, now)) return { step: 'question' };
  const pending = wrapUpCards(session);
  if (!pending.length) return { step: 'done' };
  const lastShown = session.answers.at(-1)?.cardId;
  const cardId = pending.find((id) => id !== lastShown) ?? pending[0];
  return { step: 'wrapup', cardId, waitMs: cardId === lastShown ? config.wrapUpWaitSeconds * 1000 : 0 };
}

// Progress text for the play screen: "12 / 25", "3:41 left", or "37 answered · 89%" for Endless.
export function progressLabel(session, now) {
  const counted = session.answers.filter((a) => !a.isWrapup);
  const { type, value } = session.length;
  if (type === 'count') return `${Math.min(counted.length, value)} / ${value}`;
  if (type === 'timer') {
    const left = Math.max(0, value * MINUTE - (now - session.startedAt));
    const seconds = Math.ceil(left / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left`;
  }
  const correct = counted.filter((a) => a.correct).length;
  return `${counted.length} answered · ${counted.length ? Math.round((correct / counted.length) * 100) : 0}%`;
}

// End-of-session summary from this session's answers (with their log values, see review.js).
// answers: [{ cardId, correct, mode, tierBefore, tierAfter, undone }]; undone = the transition was undone.
export function summarize(answers) {
  const correct = answers.filter((a) => a.correct).length;
  const moved = (test) => [...new Set(answers.filter((a) => !a.undone && test(a)).map((a) => a.cardId))];
  const lastByCard = new Map(answers.map((a) => [a.cardId, a]));
  return {
    answered: answers.length,
    percentCorrect: answers.length ? Math.round((correct / answers.length) * 100) : 0,
    newLearned: new Set(answers.filter((a) => a.mode === 'new').map((a) => a.cardId)).size,
    banked: moved((a) => a.tierBefore === 'rotation' && a.tierAfter === 'bank'),
    mastered: moved((a) => a.tierBefore === 'bank' && a.tierAfter === 'mastered'),
    backToRotation: moved((a) => a.tierBefore !== 'rotation' && a.tierAfter === 'rotation'),
    // Missed at any point this session, so I can see what's shaky (even if later answered right).
    missed: [...new Set(answers.filter((a) => !a.correct).map((a) => a.cardId))],
    // Of those, the ones whose last answer this session was still wrong.
    stillMissed: [...lastByCard.values()].filter((a) => !a.correct).map((a) => a.cardId),
  };
}
