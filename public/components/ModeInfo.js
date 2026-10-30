import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Modal } from './Modal.js';

export function InfoIcon() {
  return html`
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
    </svg>
  `;
}

// The ⓘ button next to a mode, opening a dialog that explains what the mode tests.
export function ModeInfoButton({ mode }) {
  const [open, setOpen] = useState(false);
  return html`
    <button type="button" class="mode-info" aria-label=${`About ${mode.label}`} onClick=${() => setOpen(true)}>
      <${InfoIcon} />
    </button>
    ${open &&
    html`
      <${Modal} title=${mode.label} onClose=${() => setOpen(false)}>
        <p>${mode.description}</p>
        <p class="example"><span class="muted small">Example</span><br />${mode.example}</p>
        <p class="muted small">${mode.totalQuestions.toLocaleString()} cards</p>
        <button type="button" class="primary full" onClick=${() => setOpen(false)}>Got it</button>
      <//>
    `}
  `;
}
