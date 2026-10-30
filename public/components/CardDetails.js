import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { ANSWER_TYPES } from '../answerTypes.js';
import { formatInterval } from '../format.js';
import { Spinner } from './Loader.js';
import { Modal } from './Modal.js';
import { TypeBadge, TypeBadges } from './TypeBadge.js';

export const TIER_LABELS = { unseen: 'Unseen', rotation: 'Rotation', bank: 'Bank', mastered: 'Mastered' };
export const ACTION_LABELS = {
  restore: 'Restore to rotation',
  demote: 'Demote to bank',
  move_to_bank: 'Move to bank',
  mark_mastered: 'Mark as mastered',
};
// What each action means, for a card that hasn't been answered yet vs. one that has.
const ACTION_HINTS = {
  restore: 'Back into normal reviews, due now. Its memory and bank count are kept.',
  demote: 'Back on bank check-ins, without going all the way to rotation.',
  move_to_bank: 'For cards you already know: they leave normal reviews and only come back for check-ins.',
  mark_mastered: 'For cards you know cold: they stop appearing in Play.',
};

// One card: what it asks, how well it's remembered, and the tier actions it allows.
export function CardDetails({ cardId, modes, onClose, onChanged }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/cards/${cardId}`).then(setCard, (err) => setError(err.message));
  }, [cardId]);

  async function act(action) {
    setBusy(true);
    try {
      await api(`/api/cards/${cardId}/action`, { method: 'POST', body: { action } });
      onChanged(`${card.title}: ${ACTION_LABELS[action].toLowerCase()}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const mode = card && modes.find((m) => m.id === card.cardType);
  const now = new Date();
  return html`
    <${Modal} title=${card?.title ?? 'Card'} onClose=${onClose}>
      ${error && html`<p class="error" role="alert">${error}</p>`}
      ${!card && !error && html`<${Spinner} />`}
      ${card &&
      html`
        <div class="card-detail">
          ${card.sprite && html`<img src=${card.sprite} alt="" width="72" height="72" />`}
          <div class="stack-tight">
            <div class="small muted">${mode?.label}${card.generation ? ` · Gen ${card.generation}` : ''}</div>
            ${card.attackType &&
            html`<div class="matchup-row start"><${TypeBadge} type=${card.attackType} /><span class="muted">vs</span><${TypeBadges} types=${card.defenderTypes} /></div>`}
            ${!card.attackType && card.defenderTypes && html`<${TypeBadges} types=${card.defenderTypes} />`}
            ${card.answer !== undefined && mode && html`<div>Answer: <strong>${ANSWER_TYPES[mode.answerType].display(card.answer)}</strong></div>`}
          </div>
        </div>
        <ul class="facts">
          <li><span>Tier</span><strong>${TIER_LABELS[card.tier]}${card.isLeech ? ' · Trouble card' : ''}</strong></li>
          ${card.tier !== 'unseen' &&
          html`
            <li><span>Recall chance now</span><strong>${Math.round(card.r * 100)}%</strong></li>
            <li><span>Stays above 90% recall for</span><strong>${formatInterval(0, card.stability * 864e5)}</strong></li>
            ${card.tier === 'rotation' &&
            html`<li><span>Next review</span><strong>${new Date(card.due) <= now ? 'Due now' : `in ${formatInterval(now, card.due)}`}</strong></li>`}
            ${card.tier === 'bank' && html`<li><span>Counted correct days</span><strong>${card.bankCorrectDays} of ${card.requiredCorrectDays}</strong></li>`}
            <li><span>Answered</span><strong>${card.reps} times · forgot ${card.lapses}</strong></li>
          `}
        </ul>
        ${card.isLeech &&
        html`<p class="note small">Missed many times after being learned. A card like this often needs a different way to remember it.</p>`}
        ${card.actions.map(
          (action) => html`
            <div key=${action} class="stack-tight">
              <button type="button" class="secondary full" disabled=${busy} onClick=${() => act(action)}>${ACTION_LABELS[action]}</button>
              <p class="small muted">${ACTION_HINTS[action]}</p>
            </div>
          `,
        )}
      `}
      <button type="button" class="primary full" onClick=${onClose}>Close</button>
    <//>
  `;
}
