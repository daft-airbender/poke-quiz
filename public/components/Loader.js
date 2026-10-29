import { html } from 'htm/preact';

export function Spinner({ label = 'Loading…' }) {
  return html`
    <div class="spinner-row" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span>${label}</span>
    </div>
  `;
}

// Full-screen notice while a request is slow, usually because the server or database
// is waking up after being idle.
export function WakeUpOverlay() {
  return html`
    <div class="overlay" role="status" aria-live="polite">
      <div class="card overlay-card">
        <span class="spinner large" aria-hidden="true"></span>
        <h2>Waking up the server…</h2>
        <p class="muted">After a break this can take up to a minute. Hang tight.</p>
      </div>
    </div>
  `;
}
