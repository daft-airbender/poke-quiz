import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { GenerationChips } from '../components/GenerationChips.js';
import { Segmented } from '../components/Segmented.js';
import { ROUND_LENGTHS } from './Home.js';

// Saved to the server, so they follow me to every device. Defaults live on the server (src/routes/settings.js).
export function Settings({ settings, generations, username, onSaved, onLogout }) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState(''); // '' | 'saving' | 'saved'
  const [error, setError] = useState('');
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

      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button type="submit" class="primary full large" disabled=${status === 'saving'}>
        ${status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save'}
      </button>

      <section class="card stack center">
        <p class="muted">Logged in as <strong>${username}</strong></p>
        <button type="button" class="secondary full" onClick=${onLogout}>Log out</button>
      </section>
    </form>
  `;
}
