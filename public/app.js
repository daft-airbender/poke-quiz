import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api, onSlowChange, onUnauthorized } from './api.js';
import { Spinner, WakeUpOverlay } from './components/Loader.js';
import { Home } from './screens/Home.js';
import { Login } from './screens/Login.js';
import { Quiz } from './screens/Quiz.js';
import { Summary } from './screens/Summary.js';

const DEFAULT_CONFIG = { mode: 'name', gens: [], count: 10 };

// Root component: checks the session, loads modes, and switches between screens.
// screen: { name: 'home' } | { name: 'quiz', round } | { name: 'summary', results, saveFailed }
function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out
  const [catalog, setCatalog] = useState(null); // { modes, generations } from /api/modes
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [screen, setScreen] = useState({ name: 'home' });
  const [waking, setWaking] = useState(false);
  const [startupError, setStartupError] = useState('');

  useEffect(() => onSlowChange(setWaking), []);
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  async function checkSession() {
    setStartupError('');
    try {
      setUser(await api('/api/me'));
    } catch (err) {
      if (err.status === 401) setUser(null);
      else setStartupError(err.message);
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (!user || catalog) return;
    api('/api/modes').then(setCatalog, (err) => setStartupError(err.message));
  }, [user]);

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setScreen({ name: 'home' });
  }

  // Each round gets a fresh id so "Play again" remounts the quiz with new questions.
  const startRound = (roundConfig) => {
    setConfig(roundConfig);
    setScreen({ name: 'quiz', round: Date.now() });
  };

  let content;
  if (startupError) {
    content = html`
      <main class="card stack">
        <p class="error" role="alert">${startupError}</p>
        <button type="button" class="primary full" onClick=${() => location.reload()}>Try again</button>
      </main>
    `;
  } else if (user === undefined || (user && !catalog)) {
    content = html`<main class="card"><${Spinner} /></main>`;
  } else if (user === null) {
    // Always land on home after logging in, even if the session expired mid-round.
    const onLoggedIn = (loggedInUser) => {
      setUser(loggedInUser);
      setScreen({ name: 'home' });
    };
    content = html`<${Login} onLoggedIn=${onLoggedIn} />`;
  } else if (screen.name === 'quiz') {
    content = html`
      <${Quiz}
        key=${screen.round}
        config=${config}
        onFinish=${(outcome) => setScreen({ name: 'summary', ...outcome })}
        onQuit=${() => setScreen({ name: 'home' })}
      />
    `;
  } else if (screen.name === 'summary') {
    content = html`
      <${Summary}
        results=${screen.results}
        saveFailed=${screen.saveFailed}
        onPlayAgain=${() => startRound(config)}
        onHome=${() => setScreen({ name: 'home' })}
      />
    `;
  } else {
    content = html`<${Home} modes=${catalog.modes} generations=${catalog.generations} initialConfig=${config} onStart=${startRound} />`;
  }

  return html`
    <header class="app-header">
      <span class="brand">Poké Quiz</span>
      ${user && html`<span class="user">${user.username} · <button type="button" class="link" onClick=${logout}>Log out</button></span>`}
    </header>
    ${content}
    ${waking && html`<${WakeUpOverlay} />`}
  `;
}

render(html`<${App} />`, document.getElementById('app'));
