import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { matchName } from '../../shared/nameMatch.js';

// Close misspellings allowed before the answer counts as wrong.
const MAX_CLOSE_MISSES = 3;

// Answer input for answerType "text": type a Pokémon's name.
// Case, accents, spaces and punctuation don't matter. A close misspelling asks to double-check
// instead of failing, up to 3 times; another Pokémon's name (question.lookAlikes) is just wrong.
export function TextAnswer({ question, answer, response, onSubmit }) {
  const [value, setValue] = useState('');
  const [closeMisses, setCloseMisses] = useState(0);
  const input = useRef(null);
  const answered = response !== null;

  useEffect(() => input.current?.focus(), []);

  function submit(event) {
    event.preventDefault();
    if (answered || !value.trim()) return;
    if (matchName(value, answer, question.lookAlikes) === 'close' && closeMisses + 1 < MAX_CLOSE_MISSES) {
      setCloseMisses(closeMisses + 1);
      input.current?.focus();
      return;
    }
    onSubmit(value.trim());
  }

  const triesLeft = MAX_CLOSE_MISSES - closeMisses;
  const stateClass = answered ? (response.correct ? 'is-correct' : 'is-wrong') : '';

  return html`
    <form class="typed-answer" onSubmit=${submit}>
      <input
        ref=${input}
        class=${stateClass}
        type="text"
        aria-label="Pokémon name"
        placeholder="Pokémon name"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck=${false}
        enterkeyhint="done"
        maxlength="40"
        value=${value}
        disabled=${answered}
        onInput=${(e) => setValue(e.currentTarget.value)}
      />
      ${!answered && closeMisses > 0 &&
      html`<p class="hint" role="status">Double-check spelling. <span class="muted">${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left</span></p>`}
      ${!answered && html`<button type="submit" class="primary full" disabled=${!value.trim()}>Submit</button>`}
    </form>
  `;
}
