import { countersDual, countersSingle } from './counters.js';
import dexToMon from './dexToMon.js';
import { effectivenessDual, effectivenessSingle } from './effectiveness.js';
import monToDex from './monToDex.js';
import monToRegion from './monToRegion.js';
import nameChoice from './nameChoice.js';
import nameText from './nameText.js';
import regionToMon from './regionToMon.js';
import type from './type.js';

// Mode registry. To add a mode, create a file in this folder and list it here.
// Each mode: { id, label, group, answerType, candidates(pool), question(candidate, pool, random), describe(key) }
//   group: heading the mode is listed under on the home screen.
//   describe(key) -> { title, sprite?, attackType?, defenderTypes?, answer? } for the progress view,
//   or null for a key it doesn't recognize.
const MODES = [
  nameText,
  nameChoice,
  type,
  effectivenessSingle,
  effectivenessDual,
  countersSingle,
  countersDual,
  monToDex,
  dexToMon,
  monToRegion,
  regionToMon,
];

const modesById = new Map(MODES.map((mode) => [mode.id, mode]));

export function getMode(id) {
  return modesById.get(id);
}

// What the frontend needs to show the mode picker and pick an answer component.
export function listModes() {
  return MODES.map(({ id, label, group, answerType }) => ({ id, label, group, answerType }));
}
