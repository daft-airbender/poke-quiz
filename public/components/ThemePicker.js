import { useState } from 'preact/hooks';
import { html } from 'htm/preact';

// Shown for "no theme": the default Poké Ball colors.
const DEFAULT_PREVIEW = { name: 'Default', colors: ['#dd330c', '#f3f4f8', '#1d1f27'] };

// Pick a theme by Pokédex number; the Pokémon's name and color swatches preview it as you type.
// value: a Pokédex number or null (default theme). onChange(value, valid): valid is false while the
// box holds a number with no Pokémon, so the form can hold off saving.
export function ThemePicker({ value, themes, onChange }) {
  const [text, setText] = useState(value === null ? '' : String(value));

  const number = text === '' ? null : Number(text);
  const theme = number === null ? DEFAULT_PREVIEW : themes[number];

  function edit(raw) {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    setText(digits);
    const next = digits === '' ? null : Number(digits);
    onChange(next, next === null || Boolean(themes[next]));
  }

  return html`
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
        />
      </div>
      <div class="theme-preview" aria-live="polite">
        ${theme
          ? html`
              <span class="theme-name">${theme.name}</span>
              <span class="swatches" aria-hidden="true">
                ${theme.colors.map((color) => html`<span key=${color} class="swatch" style=${{ background: color }}></span>`)}
              </span>
            `
          : html`<span class="error small">No Pokémon #${text}</span>`}
      </div>
    </div>
    ${text !== '' && html`<button type="button" class="link small" onClick=${() => edit('')}>Use the default theme</button>`}
  `;
}
