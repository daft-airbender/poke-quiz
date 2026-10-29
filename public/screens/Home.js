import { useState } from 'preact/hooks';
import { html } from 'htm/preact';

const ROUND_LENGTHS = [10, 20, 30];

// Mode picker, generation filter, round length, Start.
// config: { mode, gens, count }; gens = [] means all generations.
export function Home({ modes, generations, initialConfig, onStart }) {
  const [config, setConfig] = useState(initialConfig);
  const update = (changes) => setConfig({ ...config, ...changes });

  function toggleGen(gen) {
    const gens = config.gens.includes(gen) ? config.gens.filter((g) => g !== gen) : [...config.gens, gen].sort((a, b) => a - b);
    // Selecting every generation is the same as "All".
    update({ gens: gens.length === generations.length ? [] : gens });
  }

  return html`
    <main class="stack">
      <section class="card stack">
        <h2>Mode</h2>
        <div class="segmented vertical">
          ${modes.map(
            (mode) => html`
              <button
                key=${mode.id}
                type="button"
                class=${config.mode === mode.id ? 'is-selected' : ''}
                aria-pressed=${config.mode === mode.id}
                onClick=${() => update({ mode: mode.id })}
              >
                ${mode.label}
              </button>
            `,
          )}
        </div>
      </section>

      <section class="card stack">
        <h2>Generations</h2>
        <div class="chips">
          <button type="button" class=${`chip ${config.gens.length === 0 ? 'is-selected' : ''}`} onClick=${() => update({ gens: [] })}>
            All
          </button>
          ${generations.map(
            (gen) => html`
              <button
                key=${gen}
                type="button"
                class=${`chip ${config.gens.includes(gen) ? 'is-selected' : ''}`}
                aria-pressed=${config.gens.includes(gen)}
                onClick=${() => toggleGen(gen)}
              >
                Gen ${gen}
              </button>
            `,
          )}
        </div>
      </section>

      <section class="card stack">
        <h2>Round length</h2>
        <div class="segmented">
          ${ROUND_LENGTHS.map(
            (count) => html`
              <button
                key=${count}
                type="button"
                class=${config.count === count ? 'is-selected' : ''}
                aria-pressed=${config.count === count}
                onClick=${() => update({ count })}
              >
                ${count}
              </button>
            `,
          )}
        </div>
      </section>

      <button type="button" class="primary full large" onClick=${() => onStart(config)}>Start</button>
    </main>
  `;
}
