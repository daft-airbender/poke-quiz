import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { ANSWER_TYPES } from '../answerTypes.js';
import { Spinner } from '../components/Loader.js';
import { QuestionView } from '../components/QuestionView.js';

// How long a correct answer stays on screen before auto-advance moves on.
const AUTO_ADVANCE_MS = 900;

// Plays one round. Answers are checked here (questions include the answer) and recorded
// to the server in the background, so a slow request never blocks the next question.
export function Quiz({ config, autoAdvance, onFinish, onQuit }) {
  const [questions, setQuestions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState(null); // { value, correct } once answered
  const results = useRef([]);
  const pendingSaves = useRef([]);
  const startedAt = useRef(new Date());
  const nextButton = useRef(null);
  const finishing = useRef(false);

  async function load() {
    setLoadError('');
    setQuestions(null);
    try {
      const params = new URLSearchParams({ mode: config.mode, count: String(config.count) });
      if (config.gens.length) params.set('gens', config.gens.join(','));
      const round = await api(`/api/quiz?${params}`);
      setQuestions(round.questions);
      startedAt.current = new Date();
    } catch (err) {
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Focus "Next" after answering, so Enter/Space advances on a laptop.
  useEffect(() => {
    if (response) nextButton.current?.focus();
  }, [response]);

  // Auto-advance after a correct answer (Settings). A miss waits for "Next" so I can read the answer.
  // Tapping "Next" first changes `response`, which cancels the timer.
  useEffect(() => {
    if (!autoAdvance || !response?.correct) return;
    const timer = setTimeout(next, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [response]);

  // Preload the next sprite so it appears instantly.
  useEffect(() => {
    const next = questions?.[index + 1];
    if (next?.sprite) new Image().src = next.sprite;
  }, [questions, index]);

  if (loadError) {
    return html`
      <main class="card stack">
        <p class="error" role="alert">${loadError}</p>
        <button type="button" class="primary full" onClick=${load}>Try again</button>
        <button type="button" class="secondary full" onClick=${onQuit}>Back</button>
      </main>
    `;
  }
  if (!questions) return html`<main class="card"><${Spinner} label="Building your round…" /></main>`;

  const question = questions[index];
  const answerType = ANSWER_TYPES[question.answerType];
  const isLast = index === questions.length - 1;
  const score = results.current.filter((r) => r.correct).length;

  function submit(value) {
    const correct = answerType.isCorrect(value, question.answer);
    setResponse({ value, correct });
    results.current.push({ question, value, correct });
    pendingSaves.current.push(
      api('/api/quiz/answer', {
        method: 'POST',
        body: { questionKey: question.questionKey, mode: question.mode, correct },
      }),
    );
  }

  async function finish() {
    // Auto-advance and a tap on "See results" can both land here; record the round once.
    if (finishing.current) return;
    finishing.current = true;
    const saves = [...pendingSaves.current];
    saves.push(
      api('/api/quiz/session', {
        method: 'POST',
        body: {
          mode: config.mode,
          total: results.current.length,
          correct: results.current.filter((r) => r.correct).length,
          startedAt: startedAt.current.toISOString(),
          finishedAt: new Date().toISOString(),
        },
      }),
    );
    const outcomes = await Promise.allSettled(saves);
    onFinish({ results: results.current, saveFailed: outcomes.some((o) => o.status === 'rejected') });
  }

  function next() {
    if (isLast) return finish();
    setIndex(index + 1);
    setResponse(null);
  }

  return html`
    <main class="stack">
      <div class="quiz-status">
        <button type="button" class="link" onClick=${onQuit}>Quit</button>
        <span>${index + 1} / ${questions.length}</span>
        <span>Score ${score}</span>
      </div>
      <div class="progress-bar" aria-hidden="true">
        <div style=${{ width: `${((index + (response ? 1 : 0)) / questions.length) * 100}%` }}></div>
      </div>

      <section class="card stack">
        <${QuestionView} question=${question} />
        <${answerType.Input}
          key=${question.questionKey}
          choices=${question.choices}
          answer=${question.answer}
          response=${response}
          onSubmit=${submit}
        />
        ${response &&
        html`
          <div class=${`feedback ${response.correct ? 'is-correct' : 'is-wrong'}`} role="status">
            ${response.correct
              ? 'Correct!'
              : html`Not quite. Answer: <strong>${answerType.display(question.answer)}</strong>`}
          </div>
          <button type="button" class="primary full" ref=${nextButton} onClick=${next}>${isLast ? 'See results' : 'Next'}</button>
        `}
      </section>
    </main>
  `;
}
