import { html } from 'htm/preact';

// The ✓ / ✗ badge on a pill or choice after answering, for its state class from TypePicker / MultipleChoice:
//   is-correct: ✓ (right answer)   is-missed: outlined ✓ (an answer not picked)   is-wrong: ✗ (wrong pick)
// Decorative: the feedback line below the question already says the answer in words.
export function ResultMark({ state }) {
  if (state === 'is-correct') return html`<span class="result-mark" aria-hidden="true">✓</span>`;
  if (state === 'is-missed') return html`<span class="result-mark missed" aria-hidden="true">✓</span>`;
  if (state === 'is-wrong') return html`<span class="result-mark wrong" aria-hidden="true">✗</span>`;
  return null;
}
