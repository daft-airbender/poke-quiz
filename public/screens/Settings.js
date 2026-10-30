import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { Modal } from '../components/Modal.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { ScopePicker } from '../components/ScopePicker.js';

// The daily limits offered (null, Unlimited, is the default); matches SRS_CONFIG.newCardsPerDayOptions.
const NEW_CARD_LIMITS = [10, 20, 30, 50, 100];

// Saved to the server, so they follow me to every device. Defaults live on the server (src/routes/settings.js).
export function Settings({ settings, modes, generations, themes, username, onSaved, onLogout }) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState(''); // '' | 'saving' | 'saved'
  const [error, setError] = useState('');
  const [themeValid, setThemeValid] = useState(true);
  const update = (changes) => {
    setDraft({ ...draft, ...changes });
    setStatus('');
  };

  async function save(event) {
    event.preventDefault();
    setError('');
    setStatus('saving');
    try {
      // Only the settings on this screen: others (like the last session length) are saved where they change.
      const saved = await api('/api/settings', {
        method: 'PUT',
        body: { theme: draft.theme, playScope: draft.playScope, newCardsPerDay: draft.newCardsPerDay },
      });
      setDraft(saved);
      setStatus('saved');
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }

  return html`
    <form class="stack" onSubmit=${save}>
      <section class="card stack">
        <div>
          <h2>What to learn</h2>
          <p class="small muted">New cards in Play come only from what's checked here. Cards you've already started keep coming back for review either way.</p>
        </div>
        <${ScopePicker} modes=${modes} generations=${generations} scope=${draft.playScope} onChange=${(playScope) => update({ playScope })} />
      </section>

      <section class="card stack">
        <div>
          <h2>New cards per day</h2>
          <p class="small muted">How many new cards Play brings in each day. Each new card comes back for a few reviews over its first month, so more new cards today means more reviews later.</p>
        </div>
        <div class="chips">
          ${[...NEW_CARD_LIMITS, null].map(
            (limit) => html`
              <button
                key=${String(limit)}
                type="button"
                class=${`chip ${draft.newCardsPerDay === limit ? 'is-selected' : ''}`}
                aria-pressed=${draft.newCardsPerDay === limit}
                onClick=${() => update({ newCardsPerDay: limit })}
              >
                ${limit ?? 'Unlimited'}
              </button>
            `,
          )}
        </div>
      </section>

      <section class="card stack">
        <${ThemePicker}
          value=${draft.theme}
          themes=${themes}
          onChange=${(theme, valid) => {
            setThemeValid(valid);
            if (valid) update({ theme });
          }}
        />
      </section>

      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button type="submit" class="primary full large" disabled=${status === 'saving' || !themeValid || draft.playScope.modes?.length === 0}>
        ${status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save'}
      </button>

      <section class="card stack center">
        <p class="muted">Logged in as <strong>${username}</strong></p>
        <button type="button" class="secondary full" onClick=${onLogout}>Log out</button>
      </section>

      <${ResetProgress} />
    </form>
  `;
}

// Deletes all progress and history on the server, after a confirmation dialog. Settings and login stay.
function ResetProgress() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState(''); // '' | 'deleting' | 'done'
  const [error, setError] = useState('');

  async function reset() {
    setError('');
    setStatus('deleting');
    try {
      await api('/api/progress/reset', { method: 'POST', body: { confirm: true } });
      setStatus('done');
      setConfirming(false);
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }

  const close = () => status !== 'deleting' && setConfirming(false);

  return html`
    <section class="card stack danger-zone">
      <div>
        <h2>Reset all progress</h2>
        <p class="muted small">Deletes every answer, score and round history on all your devices. Your login and settings stay.</p>
      </div>
      ${status === 'done' && html`<p class="small" role="status">All progress deleted.</p>`}
      <button type="button" class="danger full" onClick=${() => { setStatus(''); setConfirming(true); }}>Reset all progress</button>

      ${confirming &&
      html`
        <${Modal} title="Delete all progress?" onClose=${close}>
          <p>This permanently deletes all your progress and history on every device. It can't be undone.</p>
          ${error && html`<p class="error" role="alert">${error}</p>`}
          <button type="button" class="danger full" disabled=${status === 'deleting'} onClick=${reset}>
            ${status === 'deleting' ? 'Deleting…' : 'Delete everything'}
          </button>
          <button type="button" class="secondary full" disabled=${status === 'deleting'} onClick=${close}>Cancel</button>
        <//>
      `}
    </section>
  `;
}
