import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { GenerationChips } from '../components/GenerationChips.js';
import { Segmented } from '../components/Segmented.js';

export const ROUND_LENGTHS = [10, 20, 30];

// Mode picker, generation filter, round length, Start.
// config: { mode, gens, count }; gens = [] means all generations.
// Generations and length start from Settings; changes here last until the page is reloaded.
export function Home({ modes, generations, initialConfig, onStart }) {
  const [config, setConfig] = useState(initialConfig);
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
              <${Segmented}
                vertical
                options=${group.modes.map((mode) => ({ value: mode.id, label: mode.label }))}
                value=${config.mode}
                onChange=${(mode) => update({ mode })}
              />
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
    </main>
  `;
}
