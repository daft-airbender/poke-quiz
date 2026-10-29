import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from 'htm/preact';

// Answer input for answerType "number": type a whole number from 1 to question.max (exact match only).
// inputmode="numeric" brings up the number keypad on phones.
export function NumberAnswer({ question, response, onSubmit }) {
  const [value, setValue] = useState('');
  const input = useRef(null);
  const answered = response !== null;

  useEffect(() => input.current?.focus(), []);

  const number = /^\d{1,4}$/.test(value) ? Number(value) : null;
  const valid = number !== null && number >= 1 && number <= question.max;

  function submit(event) {
    event.preventDefault();
    if (!answered && valid) onSubmit(number);
  }

  const stateClass = answered ? (response.correct ? 'is-correct' : 'is-wrong') : '';

  return html`
    <form class="typed-answer" onSubmit=${submit}>
      <div class="number-field">
        <span class="muted">#</span>
        <input
          ref=${input}
          class=${stateClass}
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          aria-label=${`Pokédex number, 1 to ${question.max}`}
          placeholder=${`1–${question.max}`}
          autocomplete="off"
          enterkeyhint="done"
          maxlength="4"
          value=${value}
          disabled=${answered}
          onInput=${(e) => setValue(e.currentTarget.value.replace(/\D/g, ''))}
        />
      </div>
      ${!answered && html`<button type="submit" class="primary full" disabled=${!valid}>Submit</button>`}
    </form>
  `;
}
