import { html } from 'htm/preact';
import { GenerationChips } from './GenerationChips.js';
import { ModeInfoButton } from './ModeInfo.js';

// "What to learn" (Play scope): which modes and generations Play introduces new cards from.
// It only gates new cards: cards already started keep coming back for review.
// modes: the mode catalog; scope: { modes: ids | null, gens: numbers | null } (null = all).
export function WhatToLearn({ modes, generations, scope, onChange }) {
  const selected = scope.modes ?? modes.map((m) => m.id);
  const gens = scope.gens ?? [];

  function toggleMode(id) {
    const next = selected.includes(id) ? selected.filter((m) => m !== id) : [...selected, id];
    onChange({ ...scope, modes: next.length === modes.length ? null : next });
  }

  // Grouped like the mode catalog (Names, Types, Pokédex, Regions), in catalog order.
  const groups = [];
  for (const mode of modes) {
    const group = groups.find((g) => g.name === mode.group);
    if (group) group.modes.push(mode);
    else groups.push({ name: mode.group, modes: [mode] });
  }

  return html`
    <div class="stack">
      <div class="row-between">
        <h3 class="small muted">Modes</h3>
        <button type="button" class="link small" onClick=${() => onChange({ ...scope, modes: null })}>All modes</button>
      </div>
      ${groups.map(
        (group) => html`
          <div key=${group.name} class="mode-group">
            <h3>${group.name}</h3>
            ${group.modes.map(
              (mode) => html`
                <div key=${mode.id} class=${`mode-row ${selected.includes(mode.id) ? 'is-selected' : ''}`}>
                  <label class="mode-select mode-check">
                    <input type="checkbox" checked=${selected.includes(mode.id)} onChange=${() => toggleMode(mode.id)} />
                    <span>${mode.label}</span>
                  </label>
                  <${ModeInfoButton} mode=${mode} />
                </div>
              `,
            )}
          </div>
        `,
      )}
      ${selected.length === 0 && html`<p class="error small" role="alert">Pick at least one mode.</p>`}

      <h3 class="small muted">Generations</h3>
      <${GenerationChips} generations=${generations} selected=${gens} onChange=${(next) => onChange({ ...scope, gens: next.length ? next : null })} />
      <p class="muted small">Type-chart modes (Effectiveness, Counters) and region modes aren't tied to a generation, so this doesn't limit them.</p>
    </div>
  `;
}
