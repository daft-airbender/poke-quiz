import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';

export function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await api('/api/login', { method: 'POST', body: { username, password } });
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return html`
    <main class="card">
      <h1>Poké Quiz</h1>
      <form class="stack" onSubmit=${submit}>
        <label class="field">
          <span>Username</span>
          <input
            name="username"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            required
            value=${username}
            onInput=${(e) => setUsername(e.currentTarget.value)}
          />
        </label>
        <label class="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autocomplete="current-password"
            required
            value=${password}
            onInput=${(e) => setPassword(e.currentTarget.value)}
          />
        </label>
        ${error && html`<p class="error" role="alert">${error}</p>`}
        <button type="submit" class="primary full" disabled=${submitting}>${submitting ? 'Logging in…' : 'Log in'}</button>
      </form>
    </main>
  `;
}
