import { html } from 'htm/preact';
import { TYPE_COLORS, typeLabel, typeTextColor } from '../types.js';

export function TypeBadge({ type }) {
  return html`
    <span class="type-badge" style=${{ background: TYPE_COLORS[type], color: typeTextColor(type) }}>
      ${typeLabel(type)}
    </span>
  `;
}

export function TypeBadges({ types }) {
  return html`<span class="type-badges">${types.map((type) => html`<${TypeBadge} key=${type} type=${type} />`)}</span>`;
}
