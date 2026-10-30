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
//   allGenerations, allGenerationsNote (optional): the generation filter is ignored for this mode,
//     and the note tells the home screen why.
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
// Whether a generation filter limits a mode's cards: not for modes that always use every generation (regions,
// single-type charts), nor for type-chart modes, whose cards are type combos rather than Pokémon.
const usesGenerations = new Map(MODES.map((mode) => [mode.id, !mode.allGenerations && Boolean(mode.candidates(ALL_POKEMON)[0]?.pokemon)]));

// What the frontend needs to show the mode picker and pick an answer component.
export function listModes() {
  return MODES.map(({ id, label, group, description, example, answerType, allGenerations = false, allGenerationsNote }) => ({
    id,
    label,
    group,
    description,
    example,
    answerType,
    allGenerations,
    allGenerationsNote,
    usesGenerations: usesGenerations.get(id),
    totalQuestions: totals.get(id),
  }));
}
