import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { GenerationChips } from '../components/GenerationChips.js';
import { Modal } from '../components/Modal.js';
import { Segmented } from '../components/Segmented.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { ROUND_LENGTHS } from './Home.js';

// Saved to the server, so they follow me to every device. Defaults live on the server (src/routes/settings.js).
export function Settings({ settings, generations, themes, username, onSaved, onLogout }) {
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
      const saved = await api('/api/settings', { method: 'PUT', body: draft });
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
        <h2>Default round length</h2>
        <${Segmented}
          options=${ROUND_LENGTHS.map((count) => ({ value: count, label: String(count) }))}
          value=${draft.roundLength}
          onChange=${(roundLength) => update({ roundLength })}
        />
      </section>

      <section class="card stack">
        <h2>Default generations</h2>
        <${GenerationChips} generations=${generations} selected=${draft.gens} onChange=${(gens) => update({ gens })} />
      </section>

      <section class="card">
        <label class="toggle">
          <span>
            <strong>Auto-advance</strong>
            <span class="small muted">Go to the next question right after a correct answer</span>
          </span>
          <input type="checkbox" checked=${draft.autoAdvance} onChange=${(e) => update({ autoAdvance: e.currentTarget.checked })} />
        </label>
      </section>

      <section class="card stack">
        <div>
          <h2>Theme</h2>
          <p class="small muted">Color the app after any Pokémon: enter its Pokédex number.</p>
        </div>
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
      <button type="submit" class="primary full large" disabled=${status === 'saving' || !themeValid}>
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
