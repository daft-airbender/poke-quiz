import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api, onSlowChange, onUnauthorized } from './api.js';
import { Spinner, WakeUpOverlay } from './components/Loader.js';
import { Cards } from './screens/Cards.js';
import { FreePlaySetup } from './screens/FreePlaySetup.js';
import { Home } from './screens/Home.js';
import { Login } from './screens/Login.js';
import { Play } from './screens/Play.js';
import { PlaySummary } from './screens/PlaySummary.js';
import { Progress } from './screens/Progress.js';
import { Settings } from './screens/Settings.js';
import { applyTheme } from './theme.js';

// Root component: checks the session, loads modes, settings and themes, and switches between screens.
// screen: { name: 'home' } | { name: 'free-play', length } | { name: 'play', session, next }
//       | { name: 'summary', summary, session } | { name: 'cards', tab?, filters? } | { name: 'progress' } | { name: 'settings' }
function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out
  const [catalog, setCatalog] = useState(null); // { modes, generations } from /api/modes
  const [themes, setThemes] = useState(null); // Pokédex number -> { name, colors } from /api/themes
  const [settings, setSettings] = useState(null); // from /api/settings, reloaded on every login
  const [screen, setScreen] = useState({ name: 'home' });
  const [starting, setStarting] = useState(false);
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
    }, (err) => setStartupError(err.message));
  }, [user]);

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    loggedOut();
    setScreen({ name: 'home' });
  }

  function settingsSaved(saved) {
    setSettings(saved);
    applyTheme(themes[saved.theme]?.colors ?? null);
  }

  // Remembers a session length chosen on Home (per kind), without touching other settings.
  async function saveLength(kind, length) {
    const saved = await api('/api/settings', { method: 'PUT', body: { lastLength: { ...settings.lastLength, [kind]: length } } });
    setSettings(saved);
  }

  // filter: Free Play's { modes, gens }.
  async function startSession(kind, length, filter) {
    if (starting) return;
    setStarting(true);
    try {
      const body = { kind, ...(length && { length }), ...(filter && { filter }) };
      const { session, next } = await api('/api/play/sessions', { method: 'POST', body });
      if (filter) setSettings({ ...settings, freePlayFilter: session.filter });
      setScreen({ name: 'play', session, next });
    } catch (err) {
      setStartupError(err.message);
    } finally {
      setStarting(false);
    }
  }

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
    // Always land on home after logging in, even if the session expired mid-play.
    const onLoggedIn = (loggedInUser) => {
      setUser(loggedInUser);
      setScreen({ name: 'home' });
    };
    content = html`<${Login} onLoggedIn=${onLoggedIn} />`;
  } else if (screen.name === 'play') {
    content = html`
      <${Play}
        key=${screen.session.id}
        session=${screen.session}
        initialNext=${screen.next}
        onFinished=${(summary) => setScreen({ name: 'summary', summary, session: screen.session })}
        onStartSession=${(kind) => startSession(kind)}
      />
    `;
  } else if (screen.name === 'summary') {
    content = html`
      <${PlaySummary}
        summary=${screen.summary}
        onKeepGoing=${() => startSession(screen.session.kind, screen.session.length, screen.session.filter)}
        onDone=${() => setScreen({ name: 'home' })}
      />
    `;
  } else if (screen.name === 'free-play') {
    content = html`
      <${FreePlaySetup}
        modes=${catalog.modes}
        generations=${catalog.generations}
        filter=${settings.freePlayFilter}
        length=${screen.length}
        onStart=${(length, filter) => startSession('free_play', length, filter)}
        onSaveLength=${saveLength}
        onBack=${() => setScreen({ name: 'home' })}
      />
    `;
  } else if (screen.name === 'cards') {
    content = html`<${Cards}
      modes=${catalog.modes}
      generations=${catalog.generations}
      initialTab=${screen.tab}
      initialFilters=${screen.filters}
      onPractice=${(kind) => startSession(kind)}
    />`;
  } else if (screen.name === 'progress') {
    content = html`<${Progress} onOpenCards=${(filters) => setScreen({ name: 'cards', tab: 'all', filters })} />`;
  } else if (screen.name === 'settings') {
    content = html`
      <${Settings}
        settings=${settings}
        modes=${catalog.modes}
        generations=${catalog.generations}
        themes=${themes}
        username=${user.username}
        onSaved=${settingsSaved}
        onLogout=${logout}
      />
    `;
  } else {
    content = html`<${Home}
      onPlay=${startSession}
      onFreePlay=${(length) => setScreen({ name: 'free-play', length })}
      onPractice=${(kind) => startSession(kind)}
      onSaveLength=${saveLength}
    />`;
  }

  // No navigation mid-session, so a stray tap can't end one (End session is on the play screen).
  const showNav = user && settings && screen.name !== 'play';
  const navLink = (name, label) => html`
    <button type="button" class=${`nav-link ${screen.name === name ? 'is-current' : ''}`} aria-current=${screen.name === name ? 'page' : undefined} onClick=${() => setScreen({ name })}>
      ${label}
    </button>
  `;

  return html`
    <header class="app-header">
      ${showNav ? html`<button type="button" class="brand" onClick=${() => setScreen({ name: 'home' })}>Poké Quiz</button>` : html`<span class="brand">Poké Quiz</span>`}
      ${showNav && html`<nav class="nav">${navLink('cards', 'Cards')}${navLink('progress', 'Progress')}${navLink('settings', 'Settings')}</nav>`}
    </header>
    ${content}
    ${waking && html`<${WakeUpOverlay} />`}
  `;
}

render(html`<${App} />`, document.getElementById('app'));
