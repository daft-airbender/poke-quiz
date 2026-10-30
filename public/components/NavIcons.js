import { html } from 'htm/preact';

// Header navigation icons: 24px, drawn with the current text color (the theme's accent, see .nav-link).
const icon = (children) => html`
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${children}
  </svg>
`;

// Two cards, one tilted behind the other: the back card is clipped to the part left of the front one.
export const CardsIcon = () =>
  icon(html`
    <clipPath id="nav-cards-behind"><rect x="0" y="0" width="7.6" height="24" /></clipPath>
    <rect x="3.5" y="5" width="11" height="15" rx="2" transform="rotate(-10 9 12.5)" clip-path="url(#nav-cards-behind)" />
    <rect x="9.5" y="4" width="11" height="15" rx="2" />
  `);

// A small bar chart on a baseline.
export const ProgressIcon = () =>
  icon(html`
    <line x1="3" y1="21" x2="21" y2="21" />
    <rect x="5" y="12" width="3.5" height="6" rx="1" />
    <rect x="10.25" y="7" width="3.5" height="11" rx="1" />
    <rect x="15.5" y="3" width="3.5" height="15" rx="1" />
  `);

// A cog: 8 teeth around a hub.
const TEETH = 8;
const cogPoints = Array.from({ length: TEETH * 4 }, (_, i) => {
  const tooth = Math.floor(i / 4);
  const step = i % 4; // two points on the tooth's top, two at its base
  const angle = ((tooth + [-0.17, 0.17, 0.3, 0.7][step]) / TEETH) * 2 * Math.PI;
  const radius = step < 2 ? 10 : 7.6;
  return `${(12 + radius * Math.cos(angle)).toFixed(2)},${(12 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(' ');
export const SettingsIcon = () =>
  icon(html`
    <polygon points=${cogPoints} />
    <circle cx="12" cy="12" r="3" />
  `);
