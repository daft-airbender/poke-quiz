import { useEffect, useRef } from 'preact/hooks';
import { html } from 'htm/preact';
import { formatInterval } from '../format.js';

const RATINGS = [
  { rating: 2, label: 'Hard', key: '2' },
  { rating: 3, label: 'Good', key: '3' },
  { rating: 4, label: 'Easy', key: '4' },
];

// After a correct answer: how hard was it to recall? Each button shows when the card would come back.
// Good is focused, so Enter or a tap on Good is the default. Keys 2/3/4 are handled by the Play screen.
export function RatingButtons({ preview, serverNow, disabled, onRate }) {
  const good = useRef(null);
  useEffect(() => good.current?.focus(), []);
  return html`
    <div class="ratings" role="group" aria-label="How hard was it to remember?">
      ${RATINGS.map(
        ({ rating, label, key }) => html`
          <button
            key=${rating}
            ref=${rating === 3 ? good : undefined}
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
