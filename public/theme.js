import { themeVariables } from './themeColors.js';

// Applies a Pokémon theme to the whole app by overriding the CSS color tokens on <html>.
// The computed tokens are also kept in this device's localStorage, so index.html can re-apply them
// before the first paint on the next visit (no flash of the default red). The server copy of the
// setting is the source of truth; this is only a per-device cache.

const STORAGE_KEY = 'theme';
const TOKENS = ['--accent', '--accent-text', '--accent-ink', '--accent-soft', '--bg'];
const DEFAULT_BROWSER_COLOR = '#dd330c';

// Not every environment has matchMedia (e.g. test DOMs); assume light there.
const darkQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

let current = load(); // { light: tokens, dark: tokens } or null for the default theme

function paint() {
  const style = document.documentElement.style;
  for (const token of TOKENS) style.removeProperty(token);
  const tokens = current?.[darkQuery?.matches ? 'dark' : 'light'];
  for (const [name, value] of Object.entries(tokens ?? {})) style.setProperty(name, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens?.['--accent'] ?? DEFAULT_BROWSER_COLOR);
}

darkQuery?.addEventListener('change', paint);

// colors: a palette (accent first) or null for the default theme.
export function applyTheme(colors) {
  current = colors ? { light: themeVariables(colors, 'light'), dark: themeVariables(colors, 'dark') } : null;
  try {
    if (current) localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode etc.): the theme still applies, just not before first paint next time.
  }
  paint();
}
