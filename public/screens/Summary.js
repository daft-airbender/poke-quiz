import { html } from 'htm/preact';
import { ANSWER_TYPES } from '../answerTypes.js';

export function Summary({ results, saveFailed, onPlayAgain, onHome }) {
  const correct = results.filter((r) => r.correct).length;
  const missed = results.filter((r) => !r.correct);
  const percent = Math.round((correct / results.length) * 100);

  return html`
    <main class="stack">
      <section class="card stack center">
        <h2>Round complete</h2>
        <p class="score">${correct} / ${results.length}</p>
        <p class="muted">${percent}% correct</p>
        ${saveFailed && html`<p class="error">Some results couldn't be saved, so they won't count toward progress.</p>`}
      </section>

      ${missed.length > 0 &&
      html`
        <section class="card stack">
          <h2>Missed (${missed.length})</h2>
          <ul class="missed-list">
            ${missed.map(({ question, value }) => {
              const { display } = ANSWER_TYPES[question.answerType];
              return html`
                <li key=${question.questionKey}>
                  ${question.sprite && html`<img src=${question.sprite} alt="" width="56" height="56" />`}
                  <div>
                    <div>${question.prompt}</div>
                    <div class="small">Answer: <strong>${display(question.answer)}</strong></div>
                    <div class="small muted">You said: ${display(value)}</div>
                  </div>
                </li>
              `;
            })}
          </ul>
        </section>
      `}

      <button type="button" class="primary full large" onClick=${onPlayAgain}>Play again</button>
      <button type="button" class="secondary full" onClick=${onHome}>Home</button>
    </main>
  `;
}
