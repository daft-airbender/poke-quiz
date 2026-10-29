import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { GenerationChips } from '../components/GenerationChips.js';
import { Modal } from '../components/Modal.js';
import { Segmented } from '../components/Segmented.js';

export const ROUND_LENGTHS = [10, 20, 30];

// Mode picker, generation filter, round length, Start.
// config: { mode, gens, count }; gens = [] means all generations.
// Generations and length start from Settings; changes here last until the page is reloaded.
export function Home({ modes, generations, initialConfig, onStart }) {
  const [config, setConfig] = useState(initialConfig);
  const [infoMode, setInfoMode] = useState(null); // mode whose info dialog is open
  const update = (changes) => setConfig({ ...config, ...changes });

  // Modes arrive in display order; group them under their headings, keeping that order.
  const groups = [];
  for (const mode of modes) {
    const group = groups.find((g) => g.name === mode.group);
    if (group) group.modes.push(mode);
    else groups.push({ name: mode.group, modes: [mode] });
  }

  return html`
    <main class="stack">
      <section class="card stack">
        <h2>Mode</h2>
        ${groups.map(
          (group) => html`
            <div key=${group.name} class="mode-group">
              <h3>${group.name}</h3>
              ${group.modes.map(
                (mode) => html`
                  <div key=${mode.id} class=${`mode-row ${config.mode === mode.id ? 'is-selected' : ''}`}>
                    <button type="button" class="mode-select" aria-pressed=${config.mode === mode.id} onClick=${() => update({ mode: mode.id })}>
                      ${mode.label}
                    </button>
                    <button type="button" class="mode-info" aria-label=${`About ${mode.label}`} onClick=${() => setInfoMode(mode)}>
                      <${InfoIcon} />
                    </button>
                  </div>
                `,
              )}
            </div>
          `,
        )}
      </section>

      <section class="card stack">
        <h2>Generations</h2>
        <${GenerationChips} generations=${generations} selected=${config.gens} onChange=${(gens) => update({ gens })} />
      </section>

      <section class="card stack">
        <h2>Round length</h2>
        <${Segmented}
          options=${ROUND_LENGTHS.map((count) => ({ value: count, label: String(count) }))}
          value=${config.count}
          onChange=${(count) => update({ count })}
        />
      </section>

      <button type="button" class="primary full large" onClick=${() => onStart(config)}>Start</button>

      ${infoMode &&
      html`
        <${Modal} title=${infoMode.label} onClose=${() => setInfoMode(null)}>
          <p>${infoMode.description}</p>
          <p class="example"><span class="muted small">Example</span><br />${infoMode.example}</p>
          <p class="muted small">${infoMode.totalQuestions.toLocaleString()} questions across all generations</p>
        <//>
      `}
    </main>
  `;
}

function InfoIcon() {
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
    </svg>
  `;
}
