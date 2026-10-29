import { useEffect, useRef } from 'preact/hooks';
import { html } from 'htm/preact';

// A modal dialog using the native <dialog> element: Esc closes it, focus stays inside while it's open,
// and focus returns to the button that opened it. Tapping the dim backdrop also closes it.
export function Modal({ title, onClose, children }) {
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    if (element.showModal) element.showModal();
    else element.setAttribute('open', ''); // very old browsers (and test DOMs) without showModal
  }, []);

  // A click whose target is the <dialog> itself landed on the backdrop, outside the content box.
  const onClick = (event) => event.target === dialog.current && onClose();

  return html`
    <dialog ref=${dialog} class="modal" aria-labelledby="modal-title" onClose=${onClose} onClick=${onClick}>
      <div class="modal-content stack">
        <h2 id="modal-title">${title}</h2>
        ${children}
        <button type="button" class="primary full" onClick=${onClose}>Got it</button>
      </div>
    </dialog>
  `;
}
