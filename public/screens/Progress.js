import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { ANSWER_TYPES } from '../answerTypes.js';
import { Spinner } from '../components/Loader.js';
import { TypeBadge, TypeBadges } from '../components/TypeBadge.js';

const percent = (correct, total) => (total ? `${Math.round((correct / total) * 100)}%` : '–');

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Accuracy per mode, the 10 weakest questions per mode, and recent rounds.
export function Progress({ onHome }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [weakMode, setWeakMode] = useState(null);

  async function load() {
    setError('');
    try {
      const data = await api('/api/progress/summary');
      setSummary(data);
      // Start the weakest list on the first mode that has something in it.
      setWeakMode((data.modes.find((m) => m.weakest.length) ?? data.modes[0]).id);
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

  const labels = new Map(summary.modes.map((m) => [m.id, m.label]));
  const selected = summary.modes.find((m) => m.id === weakMode);

  return html`
    <main class="stack">
      <section class="card stack">
        <h2>Accuracy</h2>
        <ul class="stat-list">
          ${summary.modes.map(
            (mode) => html`
              <li key=${mode.id}>
                <div>
                  <div><strong>${mode.label}</strong></div>
                  <div class="small muted">
                    ${mode.answers ? `${mode.answers} answers · ${mode.itemsSeen} of ${mode.totalItems} seen` : 'Not played yet'}
                  </div>
                </div>
                <span class="stat">${percent(mode.correct, mode.answers)}</span>
              </li>
            `,
          )}
        </ul>
      </section>

      <section class="card stack">
        <h2>Weakest</h2>
        <div class="chips">
          ${summary.modes.map(
            (mode) => html`
              <button
                key=${mode.id}
                type="button"
                class=${`chip ${mode.id === weakMode ? 'is-selected' : ''}`}
                aria-pressed=${mode.id === weakMode}
                onClick=${() => setWeakMode(mode.id)}
              >
                ${mode.label}${mode.weakest.length > 0 && html` <span class="muted">${mode.weakest.length}</span>`}
              </button>
            `,
          )}
        </div>
        ${selected.weakest.length === 0
          ? html`<p class="muted">Nothing missed yet in ${selected.label}.</p>`
          : html`<ul class="missed-list">
              ${selected.weakest.map((item) => html`<${WeakItem} key=${item.questionKey} item=${item} answerType=${selected.answerType} />`)}
            </ul>`}
      </section>

      <section class="card stack">
        <h2>Recent rounds</h2>
        ${summary.recentSessions.length === 0
          ? html`<p class="muted">No finished rounds yet.</p>`
          : html`<ul class="stat-list">
              ${summary.recentSessions.map(
                (session) => html`
                  <li>
                    <div>
                      <div>${labels.get(session.mode) ?? session.mode}</div>
                      <div class="small muted">${dateFormat.format(new Date(session.finishedAt))}</div>
                    </div>
                    <span class="stat">${session.correct} / ${session.total}</span>
                  </li>
                `,
              )}
            </ul>`}
      </section>

      <button type="button" class="secondary full" onClick=${onHome}>Home</button>
    </main>
  `;
}

function WeakItem({ item, answerType }) {
  const { display } = ANSWER_TYPES[answerType];
  return html`
    <li>
      ${item.sprite && html`<img src=${item.sprite} alt="" width="56" height="56" />`}
      <div>
        ${item.attackType
          ? html`<div class="matchup-row start">
              <${TypeBadge} type=${item.attackType} />
              <span class="muted">vs</span>
              <${TypeBadges} types=${item.defenderTypes} />
            </div>`
          : html`<div>${item.title}</div>`}
        ${item.answer && html`<div class="small">Answer: <strong>${display(item.answer)}</strong></div>`}
        <div class="small muted">${item.timesCorrect} of ${item.timesSeen} correct</div>
      </div>
    </li>
  `;
}
