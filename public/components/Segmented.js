import { html } from 'htm/preact';

// A row (or column) of buttons where exactly one is selected.
// options: [{ value, label }]
export function Segmented({ options, value, onChange, vertical = false }) {
  return html`
    <div class=${`segmented ${vertical ? 'vertical' : ''}`}>
      ${options.map(
        (option) => html`
          <button
            key=${option.value}
            type="button"
            class=${value === option.value ? 'is-selected' : ''}
            aria-pressed=${value === option.value}
            onClick=${() => onChange(option.value)}
          >
            ${option.label}
          </button>
        `,
      )}
    </div>
  `;
}
