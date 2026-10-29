import { ALL_POKEMON } from '../pokemon.js';
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
// Each mode: { id, label, group, description, example, answerType, candidates(pool), question(candidate, pool, random), describe(key) }
//   group: heading the mode is listed under on the home screen.
//   description, example: shown in the mode's info dialog on the home screen.
//   allGenerations (optional): the generation filter is ignored for this mode.
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

// How many questions each mode has across all generations (computed once).
const totals = new Map(MODES.map((mode) => [mode.id, mode.candidates(ALL_POKEMON).length]));

// What the frontend needs to show the mode picker and pick an answer component.
export function listModes() {
  return MODES.map(({ id, label, group, description, example, answerType, allGenerations = false }) => ({
    id,
    label,
    group,
    description,
    example,
    answerType,
    allGenerations,
    totalQuestions: totals.get(id),
  }));
}
