import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { TYPE_COLORS, typeLabel, typeTextColor } from '../types.js';

const MAX_SELECTED = 2;

// Answer input for answerType "types": select 1 or 2 types, then submit.
// After answering: correct types are marked green, wrong picks red, and missed ones outlined.
export function TypePicker({ choices, answer, response, onSubmit }) {
  const [selected, setSelected] = useState([]);
  const answered = response !== null;
  const picked = answered ? response.value : selected;

  function toggle(type) {
    if (selected.includes(type)) setSelected(selected.filter((t) => t !== type));
    else if (selected.length < MAX_SELECTED) setSelected([...selected, type]);
  }

  const stateClass = (type) => {
    const isPicked = picked.includes(type);
    if (!answered) return isPicked ? 'is-selected' : selected.length >= MAX_SELECTED ? 'is-dimmed' : '';
    if (answer.includes(type)) return isPicked ? 'is-correct' : 'is-missed';
    return isPicked ? 'is-wrong' : 'is-dimmed';
  };

  return html`
    <div>
      <div class="type-grid">
        ${choices.map(
          (type) => html`
            <button
              key=${type}
              type="button"
              class=${`type-option ${stateClass(type)}`}
              style=${{ background: TYPE_COLORS[type], color: typeTextColor(type) }}
              disabled=${answered}
              aria-pressed=${picked.includes(type)}
              onClick=${() => toggle(type)}
            >
              ${typeLabel(type)}
            </button>
          `,
        )}
      </div>
      ${!answered &&
      html`
        <button type="button" class="primary full" disabled=${selected.length === 0} onClick=${() => onSubmit(selected)}>
          Submit
        </button>
      `}
    </div>
  `;
}
