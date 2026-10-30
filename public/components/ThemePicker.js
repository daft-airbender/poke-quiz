import { useState } from 'preact/hooks';
import { html } from 'htm/preact';

// The default theme (also the app's built-in colors in styles.css).
export const DEFAULT_THEME = 1;

const Chevron = ({ up }) => html`
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points=${up ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
  </svg>
`;

// The whole Theme section: pick a theme by Pokédex number (typed, or stepped with ▼ / ▲ and the arrow keys,
// wrapping around 1 ↔ the last), with the Pokémon's name and two color swatches as a preview. The Default
// button sits in the heading row and stays put (grayed out when already on the default), so nothing shifts.
// value: a Pokédex number. onChange(value, valid): valid is false while the box is empty or holds a number
// with no Pokémon, so the form can hold off saving.
export function ThemePicker({ value, themes, onChange }) {
  const [text, setText] = useState(String(value));
  const count = Object.keys(themes).length;

  const number = text === '' ? null : Number(text);
  const theme = number === null ? null : themes[number];

  function edit(raw) {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    setText(digits);
    const next = digits === '' ? null : Number(digits);
    onChange(next, next !== null && Boolean(themes[next]));
  }

  // One step through the Pokédex, wrapping around. From an empty or unknown number, start at the default.
  function step(delta) {
    const from = theme ? number : DEFAULT_THEME - delta;
    edit(String((((from - 1 + delta) % count) + count) % count + 1));
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      step(event.key === 'ArrowUp' ? 1 : -1);
    }
  }

  return html`
    <div class="row-between">
      <h2>Theme</h2>
      <button type="button" class="chip" disabled=${number === DEFAULT_THEME} onClick=${() => edit(String(DEFAULT_THEME))}>
        Default (#${DEFAULT_THEME})
      </button>
    </div>
    <p class="small muted">Color the app after any Pokémon: enter its Pokédex number, or step through with the arrows.</p>
    <div class="theme-picker">
      <div class="number-field theme-number">
        <span class="muted">#</span>
        <input
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="4"
          aria-label="Theme Pokédex number"
          placeholder="—"
          autocomplete="off"
          value=${text}
          onInput=${(e) => edit(e.currentTarget.value)}
          onKeyDown=${onKeyDown}
        />
      </div>
      <div class="stepper" role="group" aria-label="Step through the Pokédex">
        <button type="button" aria-label="Previous Pokédex number" title="Previous" onClick=${() => step(-1)}><${Chevron} /></button>
        <button type="button" aria-label="Next Pokédex number" title="Next" onClick=${() => step(1)}><${Chevron} up /></button>
      </div>
      <div class="theme-preview" aria-live="polite">
        ${theme
          ? html`
              <span class="theme-name">${theme.name}</span>
              <span class="swatches" aria-hidden="true">
                ${theme.colors.map((color) => html`<span key=${color} class="swatch" style=${{ background: color }}></span>`)}
              </span>
            `
          : html`<span class="error small">${text === '' ? 'Enter a Pokédex number' : `No Pokémon #${text}`}</span>`}
      </div>
    </div>
  `;
}
