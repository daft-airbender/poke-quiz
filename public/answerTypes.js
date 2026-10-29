import { html } from 'htm/preact';
import { MultipleChoice } from './components/MultipleChoice.js';
import { TypeBadges } from './components/TypeBadge.js';
import { TypePicker } from './components/TypePicker.js';

// One entry per answerType the server can send (see src/quiz/modes/).
// A new mode that reuses one of these needs no frontend changes.
//   Input:     component that collects the answer and shows right/wrong feedback
//   isCorrect: (value, answer) => boolean
//   display:   renders an answer (or the user's response) for the round summary
export const ANSWER_TYPES = {
  choice: {
    Input: MultipleChoice,
    isCorrect: (value, answer) => value === answer,
    display: (value) => value,
  },
  types: {
    Input: TypePicker,
    // Same set of types, in any order.
    isCorrect: (value, answer) => value.length === answer.length && answer.every((type) => value.includes(type)),
    display: (value) => html`<${TypeBadges} types=${value} />`,
  },
};
