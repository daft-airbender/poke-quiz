import { test } from 'node:test';
import assert from 'node:assert/strict';
import palettes from '../data/pokemon-palettes.json' with { type: 'json' };
import { contrast, MIN_CONTRAST, SURFACES, themeVariables } from '../public/themeColors.js';
import { distinctColors } from '../scripts/colorDistinct.js';
import { ALL_POKEMON } from '../src/quiz/pokemon.js';

const entries = Object.entries(palettes.palettes);

test('every Pokémon has exactly two visually distinct colors', () => {
  assert.equal(entries.length, ALL_POKEMON.length);
  for (const [id, colors] of entries) {
    assert.equal(colors.length, 2, id);
    assert.ok(colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), id);
    assert.ok(distinctColors(colors[0], colors[1]), `#${id}: ${colors.join(' / ')} are too alike`);
  }
});

// The whole point of the guardrails: no theme can make the app unreadable, in either color scheme.
test('every theme keeps text readable in light and dark mode', () => {
  for (const [id, colors] of entries) {
    for (const scheme of ['light', 'dark']) {
      const v = themeVariables(colors, scheme);
      const { card, text } = SURFACES[scheme];
      const at = `#${id} ${scheme}`;
      assert.ok(contrast(v['--accent-text'], v['--accent']) >= MIN_CONTRAST, `button text on accent, ${at}`);
      for (const surface of [card, v['--bg'], v['--accent-soft']]) {
        assert.ok(contrast(v['--accent-ink'], surface) >= MIN_CONTRAST, `accent ink on ${surface}, ${at}`);
        assert.ok(contrast(text, surface) >= MIN_CONTRAST, `body text on ${surface}, ${at}`);
      }
    }
  }
});

test('Blaziken: red accent, ink darkened for light mode and lightened for dark', () => {
  const blaziken = palettes.palettes['257'];
  const light = themeVariables(blaziken, 'light');
  const dark = themeVariables(blaziken, 'dark');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(blaziken[0].slice(i, i + 2), 16));
  assert.ok(r > g + 60 && r > b + 60, 'accent is red');
  assert.ok(contrast(light['--accent-ink'], '#000000') < contrast(blaziken[0], '#000000') + 0.01, 'light-mode ink is no lighter');
  assert.ok(contrast(dark['--accent-ink'], '#ffffff') <= contrast(blaziken[0], '#ffffff'), 'dark-mode ink is no darker');
});
