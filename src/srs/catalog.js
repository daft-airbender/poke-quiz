// The card catalog, built from the mode registry: every question a mode can ask (across all generations)
// is one card. scripts/sync-cards.js writes this to the cards table.
import { getMode, listModes } from '../quiz/modes/index.js';
import { ALL_POKEMON } from '../quiz/pokemon.js';

// promptKey -> { mode, candidate }, built on first use.
let candidatesByKey = null;

// The question for one card (same shape as a round question: { questionKey, mode, answerType, prompt, ... }),
// or null if no mode produces that key any more. Wrong options are fresh every time.
export function questionForCard(promptKey, random = Math.random) {
  candidatesByKey ??= new Map(
    listModes().flatMap(({ id }) => getMode(id).candidates(ALL_POKEMON).map((candidate) => [candidate.key, { mode: getMode(id), candidate }])),
  );
  const entry = candidatesByKey.get(promptKey);
  if (!entry) return null;
  const { mode, candidate } = entry;
  return { questionKey: promptKey, mode: mode.id, answerType: mode.answerType, ...mode.question(candidate, ALL_POKEMON, random) };
}

// [{ cardType, promptKey, payload, generation, sortOrder }]
//   payload:   the mode's describe(key), for lists like Bank / Mastered (title, sprite, answer, ...)
//   generation: the Pokémon's generation, or null for type-chart cards
//   sortOrder: position within its card type (Pokédex order for Pokémon cards)
export function buildCatalog() {
  return listModes().flatMap(({ id }) => {
    const mode = getMode(id);
    return mode.candidates(ALL_POKEMON).map((candidate, index) => ({
      cardType: id,
      promptKey: candidate.key,
      payload: mode.describe(candidate.key),
      generation: candidate.pokemon?.generation ?? null,
      sortOrder: index,
    }));
  });
}
