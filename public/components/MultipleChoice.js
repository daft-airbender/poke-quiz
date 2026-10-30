import { html } from 'htm/preact';
import { ResultMark } from './ResultMark.js';

// Short options (0×, ½×…) sit 2 or 3 to a row; long lists (regions) use 2 columns; names get a row each.
function layoutClass(choices, withSprites) {
  if (withSprites) return 'choices-2';
  const short = choices.every((choice) => choice.length <= 3);
  if (short) return choices.length % 3 === 0 ? 'choices-3' : 'choices-2';
  return choices.length > 4 ? 'choices-2' : '';
}

// Answer input for answerType "choice": tap one option. Options can carry a sprite (question.choiceSprites).
// After answering, the correct option turns green and a wrong pick turns red.
export function MultipleChoice({ question, choices, answer, response, onSubmit }) {
  const sprites = question.choiceSprites;
  const answered = response !== null;

  const stateClass = (choice) => {
    if (!answered) return '';
    if (choice === answer) return 'is-correct';
    if (choice === response.value) return 'is-wrong';
    return 'is-dimmed';
  };

  return html`
    <div class=${`choices ${layoutClass(choices, sprites)}`}>
      ${choices.map(
        (choice) => html`
          <button
            key=${choice}
            type="button"
            class=${`choice ${sprites ? 'with-sprite' : ''} ${stateClass(choice)}`}
            disabled=${answered}
            onClick=${() => onSubmit(choice)}
          >
            ${sprites?.[choice] && html`<img src=${sprites[choice]} alt="" width="96" height="96" />`}
            ${choice}
            <${ResultMark} state=${stateClass(choice)} />
          </button>
        `,
      )}
    </div>
  `;
}
