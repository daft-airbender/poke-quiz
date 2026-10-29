import matchup from './matchup.js';
import name from './name.js';
import type from './type.js';

// Mode registry. To add a mode, create a file in this folder and list it here.
const MODES = [name, type, matchup];

const modesById = new Map(MODES.map((mode) => [mode.id, mode]));

export function getMode(id) {
  return modesById.get(id);
}

// What the frontend needs to show the mode picker and pick an answer component.
export function listModes() {
  return MODES.map(({ id, label, answerType }) => ({ id, label, answerType }));
}
