import { html } from 'htm/preact';
import { lengthLabel } from '../format.js';
import { Modal } from './Modal.js';

const OPTIONS = {
  Questions: [10, 25, 50].map((value) => ({ type: 'count', value })),
  Timer: [5, 10, 20].map((value) => ({ type: 'timer', value })),
  Other: [{ type: 'endless' }],
};
const same = (a, b) => a.type === b.type && (a.value ?? null) === (b.value ?? null);

// Dialog to choose a session length. The choice is remembered for next time.
export function LengthPicker({ value, onPick, onClose }) {
  return html`
    <${Modal} title="Session length" onClose=${onClose}>
      ${Object.entries(OPTIONS).map(
        ([group, lengths]) => html`
          <div key=${group} class="stack length-group">
            <h3 class="muted small">${group}</h3>
            <div class="chips">
              ${lengths.map(
                (length) => html`
                  <button
                    key=${lengthLabel(length)}
                    type="button"
                    class=${`chip ${same(length, value) ? 'is-selected' : ''}`}
                    aria-pressed=${same(length, value)}
                    onClick=${() => onPick(length)}
                  >
                    ${lengthLabel(length)}
                  </button>
                `,
              )}
            </div>
          </div>
        `,
      )}
      <p class="muted small">Length never changes how answers are scheduled; it only decides when the session stops.</p>
      <button type="button" class="secondary full" onClick=${onClose}>Cancel</button>
    <//>
  `;
}
