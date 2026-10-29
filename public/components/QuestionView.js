import { html } from 'htm/preact';
import { TypeBadge, TypeBadges } from './TypeBadge.js';

// Sprite and prompt for any question. Matchup questions also show the types as badges.
// The sprite's alt text is generic on purpose: the Pokémon's name would give away "Name it" answers.
export function QuestionView({ question }) {
  const { sprite, prompt, attackType, defenderTypes, example } = question;

  return html`
    <div class="question">
      ${sprite &&
      html`
        <div class="sprite-frame">
          <img class="sprite" src=${sprite} alt="Pokémon sprite" width="192" height="192" />
        </div>
      `}
      ${attackType &&
      html`
        <div class="matchup-row">
          <${TypeBadge} type=${attackType} />
          <span class="muted">vs</span>
          <${TypeBadges} types=${defenderTypes} />
        </div>
      `}
      <h2 class="prompt">${prompt}</h2>
      ${example && html`<p class="muted small">e.g. ${example}</p>`}
    </div>
  `;
}
