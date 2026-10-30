import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api, onSlowChange, onUnauthorized } from './api.js';
import { Spinner, WakeUpOverlay } from './components/Loader.js';
import { Home } from './screens/Home.js';
import { Login } from './screens/Login.js';
import { Progress } from './screens/Progress.js';
import { Quiz } from './screens/Quiz.js';
import { Settings } from './screens/Settings.js';
import { Summary } from './screens/Summary.js';
import { applyTheme } from './theme.js';

// The next round's choices, starting from the saved defaults. The mode isn't a setting.
const configFrom = (settings, mode) => ({ mode, gens: settings.gens, count: settings.roundLength });

// Root component: checks the session, loads modes and settings, and switches between screens.
// screen: { name: 'home' } | { name: 'quiz', round } | { name: 'summary', results, saveFailed }
//       | { name: 'progress' } | { name: 'settings' }
function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out
  const [catalog, setCatalog] = useState(null); // { modes, generations } from /api/modes
  const [themes, setThemes] = useState(null); // Pokédex number -> { name, colors } from /api/themes
  const [settings, setSettings] = useState(null); // from /api/settings, reloaded on every login
  const [config, setConfig] = useState(null);
  const [screen, setScreen] = useState({ name: 'home' });
  const [waking, setWaking] = useState(false);
  const [startupError, setStartupError] = useState('');

  useEffect(() => onSlowChange(setWaking), []);
  useEffect(() => onUnauthorized(loggedOut), []);

  function loggedOut() {
    setUser(null);
    setSettings(null);
  }

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

  // Settings may have changed on another device, so fetch them on every login, not just the first.
  useEffect(() => {
    if (!user) return;
    Promise.all([api('/api/modes'), api('/api/settings'), api('/api/themes')]).then(([modes, saved, themeList]) => {
      setCatalog(modes);
      setThemes(themeList.themes);
      applyTheme(themeList.themes[saved.theme]?.colors ?? null);
      setSettings(saved);
      // Start on the first mode in the list.
      setConfig(configFrom(saved, modes.modes[0].id));
    }, (err) => setStartupError(err.message));
  }, [user]);

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    loggedOut();
    setScreen({ name: 'home' });
  }

  // New defaults apply to Home right away; the selected mode stays.
  function settingsSaved(saved) {
    setSettings(saved);
    applyTheme(themes[saved.theme]?.colors ?? null);
    setConfig(configFrom(saved, config.mode));
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
  } else if (user === undefined || (user && !settings)) {
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
        autoAdvance=${settings.autoAdvance}
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
  } else if (screen.name === 'progress') {
    content = html`<${Progress} onHome=${() => setScreen({ name: 'home' })} />`;
  } else if (screen.name === 'settings') {
    content = html`
      <${Settings}
        settings=${settings}
        generations=${catalog.generations}
        themes=${themes}
        username=${user.username}
        onSaved=${settingsSaved}
        onLogout=${logout}
      />
    `;
  } else {
    content = html`<${Home} modes=${catalog.modes} generations=${catalog.generations} initialConfig=${config} onStart=${startRound} />`;
  }

  // No navigation mid-round, so a stray tap can't throw a round away (Quit is on the quiz screen).
  const showNav = user && settings && screen.name !== 'quiz';
  const navLink = (name, label) => html`
    <button type="button" class=${`nav-link ${screen.name === name ? 'is-current' : ''}`} aria-current=${screen.name === name ? 'page' : undefined} onClick=${() => setScreen({ name })}>
      ${label}
    </button>
  `;

  return html`
    <header class="app-header">
      ${showNav ? html`<button type="button" class="brand" onClick=${() => setScreen({ name: 'home' })}>Poké Quiz</button>` : html`<span class="brand">Poké Quiz</span>`}
      ${showNav && html`<nav class="nav">${navLink('progress', 'Progress')}${navLink('settings', 'Settings')}</nav>`}
    </header>
    ${content}
    ${waking && html`<${WakeUpOverlay} />`}
  `;
}

render(html`<${App} />`, document.getElementById('app'));
