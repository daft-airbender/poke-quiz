import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { LengthPicker } from '../components/LengthPicker.js';
import { Spinner } from '../components/Loader.js';
import { lengthLabel } from '../format.js';

// Today at a glance, and Play. Play starts right away with the last length used; the small
// "25 questions ▾" control changes it (spec: "Session length").
export function Home({ onPlay, onSaveLength }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  async function load() {
    setError('');
    try {
      setOverview(await api('/api/play/overview'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return html`
      <main class="card stack">
        <p class="error" role="alert">${error}</p>
        <button type="button" class="primary full" onClick=${load}>Try again</button>
      </main>
    `;
  }
  if (!overview) return html`<main class="card"><${Spinner} /></main>`;

  const length = overview.lengths.play;
  const studied = overview.rotation + overview.bank + overview.mastered;

  async function pickLength(next) {
    setPicking(false);
    setOverview({ ...overview, lengths: { ...overview.lengths, play: next } });
    await onSaveLength('play', next);
  }

  return html`
    <main class="stack">
      <section class="card stack today">
        <h2>Today</h2>
        <div class="today-stats">
          <div><span class="stat">${overview.dueNow}</span><span class="muted small">due now</span></div>
          <div><span class="stat">${overview.newLeft}</span><span class="muted small">new left</span></div>
        </div>
        <p class="muted small">
          ${studied === 0
            ? 'Nothing studied yet. Play introduces new cards a few at a time.'
            : `${overview.rotation} learning · ${overview.bank} in the bank · ${overview.mastered} mastered`}
        </p>
      </section>

      <section class="stack">
        <button type="button" class="primary full large play-button" onClick=${() => onPlay('play', length)}>Play</button>
        <button type="button" class="length-control" aria-haspopup="dialog" onClick=${() => setPicking(true)}>
          ${lengthLabel(length)} <span aria-hidden="true">▾</span>
        </button>
      </section>

      <section class="card stack">
        <button type="button" class="secondary full" disabled>Free Play</button>
        <p class="muted small">Quiz yourself on anything, without affecting your learning. Coming in the next update.</p>
      </section>

      ${picking && html`<${LengthPicker} value=${length} onPick=${pickLength} onClose=${() => setPicking(false)} />`}
    </main>
  `;
}
