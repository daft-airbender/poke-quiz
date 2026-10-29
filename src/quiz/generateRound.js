import { getMode } from './modes/index.js';
import { pokemonInGens } from './pokemon.js';
import { weightedSample } from './random.js';
import { weight } from './weighting.js';

// Builds a round of `count` distinct questions for a mode, from Pokémon in `gens` (all if empty,
// or if the mode ignores the generation filter).
// `progress` maps questionKey -> progress row; weak and new questions are picked more often.
// Each question: { questionKey, mode, answerType, prompt, sprite?, choices, answer, ... }.
export function generateRound({ modeId, count, gens = [], progress = new Map(), now = Date.now(), random = Math.random }) {
  const mode = getMode(modeId);
  if (!mode) throw new Error(`Unknown mode: ${modeId}`);

  const pool = pokemonInGens(mode.allGenerations ? [] : gens);
  const chosen = weightedSample(mode.candidates(pool), count, (candidate) => weight(progress.get(candidate.key), now), random);

  return chosen.map((candidate) => ({
    questionKey: candidate.key,
    mode: mode.id,
    answerType: mode.answerType,
    ...mode.question(candidate, pool, random),
  }));
}
