import { effectivenessDual, effectivenessSingle } from './effectiveness.js';
import nameChoice from './nameChoice.js';
import type from './type.js';

// Mode registry. To add a mode, create a file in this folder and list it here.
// Each mode: { id, label, answerType, candidates(pool), question(candidate, pool, random), describe(key) }
//   describe(key) -> { title, sprite?, attackType?, defenderTypes?, answer? } for the progress view,
//   or null for a key it doesn't recognize.
const MODES = [nameChoice, type, effectivenessSingle, effectivenessDual];

const modesById = new Map(MODES.map((mode) => [mode.id, mode]));

export function getMode(id) {
  return modesById.get(id);
}

// What the frontend needs to show the mode picker and pick an answer component.
export function listModes() {
  return MODES.map(({ id, label, answerType }) => ({ id, label, answerType }));
}
