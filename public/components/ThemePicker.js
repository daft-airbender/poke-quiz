import { useState } from 'preact/hooks';
import { html } from 'htm/preact';

// The default theme (also the app's built-in colors in styles.css).
export const DEFAULT_THEME = 1;

// Pick a theme by Pokédex number; the Pokémon's name and color swatches preview it as you type.
// value: a Pokédex number. onChange(value, valid): valid is false while the box is empty or holds a
// number with no Pokémon, so the form can hold off saving.
export function ThemePicker({ value, themes, onChange }) {
  const [text, setText] = useState(String(value));

  const number = text === '' ? null : Number(text);
  const theme = number === null ? null : themes[number];

  function edit(raw) {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    setText(digits);
    const next = digits === '' ? null : Number(digits);
    onChange(next, next !== null && Boolean(themes[next]));
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
          : html`<span class="error small">${text === '' ? 'Enter a Pokédex number' : `No Pokémon #${text}`}</span>`}
      </div>
    </div>
    ${number !== DEFAULT_THEME &&
    html`<button type="button" class="link small" onClick=${() => edit(String(DEFAULT_THEME))}>Use the default theme (#${DEFAULT_THEME} ${themes[DEFAULT_THEME].name})</button>`}
  `;
}
