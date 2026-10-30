import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { Spinner } from '../components/Loader.js';
import { KIND_LABELS } from '../format.js';

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const TIERS = [
  ['unseen', 'Unseen'],
  ['rotation', 'Learning'],
  ['bank', 'Bank'],
  ['mastered', 'Mastered'],
];

// A simple overview until the full Progress screen with charts (SRS phase S8).
export function Progress({ onHome }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setSummary(await api('/api/progress/summary'));
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
  if (!summary) return html`<main class="card"><${Spinner} label="Loading progress…" /></main>`;

  return html`
    <main class="stack">
      <section class="card stack">
        <h2>Cards</h2>
        <ul class="stat-list">
          ${TIERS.map(
            ([key, label]) => html`
              <li key=${key}>
                <span>${label}</span>
                <span class="stat">${summary.tiers[key].toLocaleString()}</span>
              </li>
            `,
          )}
        </ul>
        <p class="muted small">${summary.dueNow} due now · ${summary.newLeft} new cards left today</p>
      </section>

      <section class="card stack">
        <h2>Recent sessions</h2>
        ${summary.recentSessions.length === 0
          ? html`<p class="muted">No sessions yet.</p>`
          : html`<ul class="stat-list">
              ${summary.recentSessions.map(
                (session) => html`
                  <li>
                    <div>
                      <div>${KIND_LABELS[session.kind] ?? session.kind}</div>
                      <div class="small muted">${dateFormat.format(new Date(session.startedAt))}</div>
                    </div>
                    <span class="stat">${session.correct} / ${session.answered}</span>
                  </li>
                `,
              )}
            </ul>`}
      </section>

      <p class="muted small center-text">Charts (collection growth, recall rate, activity) come with the full Progress screen.</p>
      <button type="button" class="secondary full" onClick=${onHome}>Home</button>
    </main>
  `;
}
