import { getMode } from './modes/index.js';
import { pokemonInGens } from './pokemon.js';
import { sample } from './random.js';

// Builds a round of `count` distinct questions for a mode, from Pokémon in `gens` (all if empty).
// Each question: { questionKey, mode, answerType, prompt, sprite?, choices, answer, ... }.
export function generateRound({ modeId, count, gens = [], random = Math.random }) {
  const mode = getMode(modeId);
  if (!mode) throw new Error(`Unknown mode: ${modeId}`);

  const pool = pokemonInGens(gens);
  // Uniformly random for now; milestone 7 weights this by progress (src/quiz/weighting.js).
  const chosen = sample(mode.candidates(pool), count, random);

  return chosen.map((candidate) => ({
    questionKey: candidate.key,
    mode: mode.id,
    answerType: mode.answerType,
    ...mode.question(candidate, pool, random),
  }));
}
