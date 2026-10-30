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

// Free Play: accuracy per mode this session.
function ByType({ rows }) {
  if (!rows?.length) return null;
  return html`
    <section class="card stack">
      <h2>By mode</h2>
      <ul class="stat-list">
        ${rows.map(
          (row) => html`
            <li key=${row.cardType}>
              <div>
                <div>${row.label}</div>
                <div class="small muted">${row.correct} of ${row.answered} correct</div>
              </div>
              <span class="stat">${Math.round((row.correct / row.answered) * 100)}%</span>
            </li>
          `,
        )}
      </ul>
    </section>
  `;
}

// End of a session (spec: "End-of-session summary" and "Free Play summary"). Free Play has no tiers or new cards.
export function PlaySummary({ summary, onKeepGoing, onDone }) {
  const freePlay = summary.kind === 'free_play';
  return html`
    <main class="stack">
      <section class="card stack center">
        <h2>${KIND_LABELS[summary.kind]} · ${lengthLabel(summary.length)}</h2>
        <p class="score">${summary.answered} answered</p>
        <p class="muted">${summary.percentCorrect}% correct${!freePlay && summary.newLearned ? ` · ${summary.newLearned} new ${summary.newLearned === 1 ? 'card' : 'cards'} learned` : ''}</p>
      </section>
      ${freePlay
        ? html`<${ByType} rows=${summary.byType} />`
        : html`
            <${CardList} title="Banked" cards=${summary.banked} />
            <${CardList} title="Mastered" cards=${summary.mastered} />
            <${CardList} title="Back to rotation" cards=${summary.backToRotation} />
          `}
      <${CardList} title="Missed" cards=${summary.missed} />
      <button type="button" class="primary full large" onClick=${onKeepGoing}>Keep going</button>
      <button type="button" class="secondary full" onClick=${onDone}>Done</button>
    </main>
  `;
}
