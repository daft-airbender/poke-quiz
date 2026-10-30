import { useEffect } from 'preact/hooks';
import { html } from 'htm/preact';

const SHOW_MS = 6000;

// A short message at the bottom of the screen, e.g. "Banked! Pikachu" with an Undo button.
export function Toast({ message, actionLabel, onAction, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message]);
  return html`
    <div class="toast" role="status">
      <span>${message}</span>
      ${actionLabel && html`<button type="button" class="link" onClick=${onAction}>${actionLabel}</button>`}
    </div>
  `;
}
