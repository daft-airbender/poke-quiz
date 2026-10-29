import { html } from 'htm/preact';

// Answer input for answerType "choice": tap one option.
// After answering, the correct option turns green and a wrong pick turns red.
export function MultipleChoice({ choices, answer, response, onSubmit }) {
  const answered = response !== null;

  const stateClass = (choice) => {
    if (!answered) return '';
    if (choice === answer) return 'is-correct';
    if (choice === response.value) return 'is-wrong';
    return 'is-dimmed';
  };

  return html`
    <div class=${`choices ${choices.length > 4 ? 'choices-compact' : ''}`}>
      ${choices.map(
        (choice) => html`
          <button
            key=${choice}
            type="button"
            class=${`choice ${stateClass(choice)}`}
            disabled=${answered}
            onClick=${() => onSubmit(choice)}
          >
            ${choice}
          </button>
        `,
      )}
    </div>
  `;
}
