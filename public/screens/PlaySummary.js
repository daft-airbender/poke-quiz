import { html } from 'htm/preact';
import { KIND_LABELS, lengthLabel } from '../format.js';

function CardList({ title, cards }) {
  if (!cards.length) return null;
  return html`
    <section class="card stack">
      <h2>${title} (${cards.length})</h2>
      <ul class="missed-list">
        ${cards.map(
          (card) => html`
            <li key=${card.cardId}>
              ${card.sprite && html`<img src=${card.sprite} alt="" width="56" height="56" />`}
              <div>${card.title}</div>
            </li>
          `,
        )}
      </ul>
    </section>
  `;
}

// End of a Play or practice session (spec: "End-of-session summary").
export function PlaySummary({ summary, onKeepGoing, onDone }) {
  return html`
    <main class="stack">
      <section class="card stack center">
        <h2>${KIND_LABELS[summary.kind]} · ${lengthLabel(summary.length)}</h2>
        <p class="score">${summary.answered} answered</p>
        <p class="muted">${summary.percentCorrect}% correct${summary.newLearned ? ` · ${summary.newLearned} new ${summary.newLearned === 1 ? 'card' : 'cards'} learned` : ''}</p>
      </section>
      <${CardList} title="Banked" cards=${summary.banked} />
      <${CardList} title="Mastered" cards=${summary.mastered} />
      <${CardList} title="Back to rotation" cards=${summary.backToRotation} />
      <${CardList} title="Missed" cards=${summary.missed} />
      <button type="button" class="primary full large" onClick=${onKeepGoing}>Keep going</button>
      <button type="button" class="secondary full" onClick=${onDone}>Done</button>
    </main>
  `;
}
