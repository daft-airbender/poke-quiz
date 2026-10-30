import { useEffect, useRef } from 'preact/hooks';
import { html } from 'htm/preact';
import { formatInterval } from '../format.js';

const RATINGS = [
  { rating: 2, label: 'Hard', key: '2' },
  { rating: 3, label: 'Good', key: '3' },
  { rating: 4, label: 'Easy', key: '4' },
];

// After a correct answer: how hard was it to recall? Each button shows when the card would come back.
// Good is focused, so Enter or a tap on Good is the default; the arrow keys move between the three and
// Enter / Space picks one. Keys 2/3/4 are handled by the Play screen.
export function RatingButtons({ preview, serverNow, disabled, onRate }) {
  const buttons = useRef([]);
  useEffect(() => buttons.current[1]?.focus(), []);

  function onKeyDown(event) {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = buttons.current.indexOf(document.activeElement);
    const next = Math.min(RATINGS.length - 1, Math.max(0, (at === -1 ? 1 : at) + step));
    buttons.current[next]?.focus();
  }

  return html`
    <div class="ratings" role="group" aria-label="How hard was it to remember? Arrow keys move between the options." onKeyDown=${onKeyDown}>
      ${RATINGS.map(
        ({ rating, label, key }, i) => html`
          <button
            key=${rating}
            ref=${(element) => (buttons.current[i] = element)}
            type="button"
            class=${`rating rating-${label.toLowerCase()}`}
            disabled=${disabled}
            aria-keyshortcuts=${key}
            onClick=${() => onRate(rating)}
          >
            <span class="rating-label">${label}</span>
            <span class="rating-when">${formatInterval(serverNow, preview[rating])}</span>
          </button>
        `,
      )}
    </div>
  `;
}
