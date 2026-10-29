import { html } from 'htm/preact';

// "All" plus one chip per generation. selected = [] means all generations.
// locked: show All selected and gray out the rest (for modes that always use every generation),
// without changing `selected`, so the choice comes back for other modes.
export function GenerationChips({ generations, selected, onChange, locked = false }) {
  if (locked) selected = [];
  function toggle(gen) {
    const gens = selected.includes(gen) ? selected.filter((g) => g !== gen) : [...selected, gen].sort((a, b) => a - b);
    // Selecting every generation is the same as "All".
    onChange(gens.length === generations.length ? [] : gens);
  }

  return html`
    <div class="chips">
      <button
        type="button"
        class=${`chip ${selected.length === 0 ? 'is-selected' : ''}`}
        aria-pressed=${selected.length === 0}
        disabled=${locked}
        onClick=${() => onChange([])}
      >
        All
      </button>
      ${generations.map(
        (gen) => html`
          <button
            key=${gen}
            type="button"
            class=${`chip ${selected.includes(gen) ? 'is-selected' : ''}`}
            aria-pressed=${selected.includes(gen)}
            disabled=${locked}
            onClick=${() => toggle(gen)}
          >
            Gen ${gen}
          </button>
        `,
      )}
    </div>
  `;
}
