import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { ANSWER_TYPES } from '../answerTypes.js';
import { Modal } from '../components/Modal.js';
import { QuestionView } from '../components/QuestionView.js';
import { RatingButtons } from '../components/RatingButtons.js';
import { Toast } from '../components/Toast.js';
import { clock } from '../format.js';

const MODE_TAGS = {
  new: 'New card',
  due: 'Due',
  bank_checkin: 'Bank check-in',
  ahead: 'Working ahead',
  bank_practice: 'Bank practice',
  mastered_practice: 'Mastered practice',
  free_play: 'Free Play',
};
// How long "Correct!" stays up in Free Play before the next card (no rating step there).
const FREE_PLAY_CORRECT_MS = 700;

// One Play, practice or Free Play session. The server picks every card; this screen asks the question, checks
// the answer, collects the rating, and shows what the server sends next (spec: "Session queue", "Session length").
//   Wrong answer -> saved right away as Again; the answer is shown until "Next".
//   Right answer -> Hard / Good / Easy (keys 2 / 3 / 4, Enter = Good), then straight to the next card.
//                   Free Play has no ratings: "Correct!" for a moment, then the next card.
//   End session (Esc) -> "Review N missed cards" or "End now" when misses are waiting for their wrap-up.
export function Play({ session, initialNext, onFinished, onStartSession }) {
  const [next, setNext] = useState(initialNext); // what's on screen (server payload)
  const [phase, setPhase] = useState('answering'); // answering | rating | feedback
  const [response, setResponse] = useState(null); // { value, correct } once answered
  const [pending, setPending] = useState(null); // what comes after a wrong answer, shown on "Next"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null); // { message, undo? }
  const [endDialog, setEndDialog] = useState(false);
  const [ending, setEnding] = useState(false); // "Review N missed cards" was chosen
  const [waiting, setWaiting] = useState(initialNext.card?.waitMs > 0); // a wrap-up card held for a few seconds
  const [, setTick] = useState(0);
  const shownAt = useRef(Date.now());
  const answeredAt = useRef(0);
  const clockSkew = useRef(0); // server time minus this device's time
  const nextButton = useRef(null);

  const freePlay = session.kind === 'free_play';
  const card = next.card;
  const progress = (pending ?? next).progress;

  // Shows what the server sent next. The per-card state resets in the same update, so an answer
  // can never land on the old card's state (or be wiped by a later reset).
  function show(payload) {
    setPhase('answering');
    setResponse(null);
    setPending(null);
    setWaiting(payload.card?.waitMs > 0);
    setNext(payload);
  }

  // A new card: hold wrap-up cards for their short wait, start the answer timer, or finish.
  useEffect(() => {
    if (next.step === 'done') {
      finish(ending ? 'quit' : 'limit');
      return;
    }
    if (!card) return;
    clockSkew.current = new Date(card.serverNow) - Date.now();
    if (card.waitMs > 0) {
      const timer = setTimeout(() => {
        setWaiting(false);
        shownAt.current = Date.now();
      }, card.waitMs);
      return () => clearTimeout(timer);
    }
    shownAt.current = Date.now();
  }, [next]);

  // A timer session's countdown ticks on screen; the server decides when time is up (between questions).
  useEffect(() => {
    if (session.length.type !== 'timer') return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (phase === 'feedback' && pending) nextButton.current?.focus();
  }, [phase, pending]);

  // Keyboard: Esc ends the session; 2 / 3 / 4 and Enter rate a correct answer.
  // A layout effect, so the listener is in place the moment the screen renders.
  useLayoutEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape' && !endDialog) {
        event.preventDefault();
        requestEnd();
      } else if (phase === 'rating' && !busy && ['2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        rate(Number(event.key));
      } else if (phase === 'rating' && !busy && event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
        // Enter = Good. (On a focused button, Enter already clicks it.)
        event.preventDefault();
        rate(3);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  async function send(rating) {
    setBusy(true);
    setError('');
    try {
      const res = await api(`/api/play/sessions/${session.id}/answers`, {
        method: 'POST',
        body: {
          cardId: card.id,
          // Free Play only records right or wrong; it never schedules.
          ...(freePlay ? { correct: rating > 1 } : { rating, mode: card.mode }),
          isWrapup: card.isWrapup,
          answerMs: Math.max(0, Math.round(answeredAt.current - shownAt.current)),
          ending,
        },
      });
      announce(res.result);
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function announce({ transition, undo, logId }) {
    if (transition === 'banked' || transition === 'mastered') {
      const word = transition === 'banked' ? 'Banked!' : 'Mastered!';
      setToast({ message: `${word} ${card.title}`, undo: { cardId: card.id, logId, undo } });
    } else if (transition === 'back_to_rotation') {
      setToast({ message: `${card.title} is back in rotation` });
    }
  }

  function submit(value) {
    answeredAt.current = Date.now();
    const correct = ANSWER_TYPES[card.question.answerType].isCorrect(value, card.question.answer);
    setResponse({ value, correct });
    if (correct && freePlay) {
      setPhase('correct');
      saveFreePlayCorrect();
    } else if (correct) {
      setPhase('rating');
    } else {
      setPhase('feedback');
      saveMiss();
    }
  }

  async function saveMiss() {
    const res = await send(1);
    if (res) setPending(res.next);
  }

  // One tap: show "Correct!" briefly, then the next card.
  async function saveFreePlayCorrect() {
    const started = Date.now();
    const res = await send(3);
    if (!res) return;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, FREE_PLAY_CORRECT_MS - (Date.now() - started))));
    show(res.next);
  }

  async function rate(rating) {
    if (busy) return;
    const res = await send(rating);
    if (res) show(res.next);
  }

  async function undo() {
    const { undo: body } = toast;
    setToast(null);
    try {
      await api('/api/play/undo', { method: 'POST', body });
      setToast({ message: 'Undone.' });
    } catch (err) {
      setToast({ message: err.message });
    }
  }

  function requestEnd() {
    if (busy) return;
    if (progress?.wrapUpPending > 0) setEndDialog(true);
    else finish('quit');
  }

  async function reviewMissed() {
    setEndDialog(false);
    setEnding(true);
    try {
      show(await api(`/api/play/sessions/${session.id}/next?ending=1`));
    } catch (err) {
      setError(err.message);
    }
  }

  async function finish(reason) {
    setEndDialog(false);
    setBusy(true);
    try {
      const { summary } = await api(`/api/play/sessions/${session.id}/end`, { method: 'POST', body: { reason } });
      onFinished(summary);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function addMoreNew() {
    setBusy(true);
    try {
      await api('/api/play/new-cards/more', { method: 'POST' });
      show(await api(`/api/play/sessions/${session.id}/next`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function practiceBank() {
    await api(`/api/play/sessions/${session.id}/end`, { method: 'POST', body: { reason: 'quit' } }).catch(() => {});
    onStartSession('bank_practice');
  }

  // Count and Endless labels come from the server; a timer counts down here.
  const label =
    session.length.type === 'timer'
      ? `${clock(new Date(session.startedAt).getTime() + session.length.value * 60000 - (Date.now() + clockSkew.current))} left`
      : progress?.label;

  const status = html`
    <div class="quiz-status">
      <button type="button" class="link" onClick=${requestEnd} aria-keyshortcuts="Escape">End session</button>
      <span>${label}</span>
      <span class="play-tag">${card ? (card.isWrapup ? 'Wrap-up' : MODE_TAGS[card.mode]) : ''}</span>
    </div>
  `;

  let body;
  if (next.step === 'empty') {
    body = html`
      <section class="card stack center">
        <h2>All caught up</h2>
        <p class="muted">Nothing is due, and ${next.canAddNew ? "today's new cards are used up" : 'there are no new cards left in What to learn'}.</p>
        ${next.canAddNew && html`<button type="button" class="primary full" disabled=${busy} onClick=${addMoreNew}>Add 10 more new cards</button>`}
        ${next.canPracticeBank && html`<button type="button" class="secondary full" disabled=${busy} onClick=${practiceBank}>Practice the bank</button>`}
        <button type="button" class="secondary full" disabled=${busy} onClick=${() => finish('quit')}>End session</button>
      </section>
    `;
  } else if (!card) {
    body = html`<section class="card"><p class="muted">Finishing…</p></section>`;
  } else if (waiting) {
    body = html`<section class="card stack center"><p class="muted">Wrap-up: one more look at a card you missed…</p></section>`;
  } else {
    const answerType = ANSWER_TYPES[card.question.answerType];
    body = html`
      <section class="card stack">
        ${card.pastNewLimit &&
        html`<p class="note small">You're past today's new cards. More new cards today means more reviews in the coming weeks.</p>`}
        ${next.progress.newCardsUsedUp &&
        html`
          <div class="note small row-between">
            <span>Today's new cards are done, so you're reviewing cards you know, ahead of schedule.</span>
            <button type="button" class="link small" disabled=${busy} onClick=${addMoreNew}>Add 10 more new cards</button>
          </div>
        `}
        <${QuestionView} question=${card.question} />
        <${answerType.Input}
          key=${`${card.id}-${next.progress.answered}`}
          question=${card.question}
          choices=${card.question.choices}
          answer=${card.question.answer}
          response=${response}
          onSubmit=${submit}
        />
        ${phase === 'correct' && html`<div class="feedback is-correct" role="status">Correct!</div>`}
        ${phase === 'rating' &&
        html`
          <div class="feedback is-correct" role="status">Correct! How easy was it to remember?</div>
          <${RatingButtons} preview=${card.preview} serverNow=${card.serverNow} disabled=${busy} onRate=${rate} />
        `}
        ${phase === 'feedback' &&
        html`
          <div class="feedback is-wrong" role="status">Answer: <strong>${answerType.display(card.question.answer)}</strong></div>
          <button type="button" class="primary full" ref=${nextButton} disabled=${!pending} onClick=${() => show(pending)}>
            ${pending ? 'Next' : 'Saving…'}
          </button>
        `}
      </section>
    `;
  }

  return html`
    <main class="stack">
      ${status}
      ${error &&
      html`
        <div class="card stack">
          <p class="error" role="alert">${error}</p>
          ${phase === 'feedback' && !pending && html`<button type="button" class="secondary full" onClick=${saveMiss}>Try again</button>`}
          ${phase === 'correct' && html`<button type="button" class="secondary full" onClick=${saveFreePlayCorrect}>Try again</button>`}
        </div>
      `}
      ${body}
      ${endDialog &&
      html`
        <${Modal} title="End session?" onClose=${() => setEndDialog(false)}>
          <p>
            ${progress.wrapUpPending} missed ${progress.wrapUpPending === 1 ? 'card is' : 'cards are'} waiting for one more try, so you
            don't finish on a miss.
          </p>
          <button type="button" class="primary full" onClick=${reviewMissed}>
            Review ${progress.wrapUpPending} missed ${progress.wrapUpPending === 1 ? 'card' : 'cards'}
          </button>
          <button type="button" class="secondary full" onClick=${() => finish('quit')}>End now</button>
        <//>
      `}
      ${toast &&
      html`<${Toast}
        message=${toast.message}
        actionLabel=${toast.undo ? 'Undo' : null}
        onAction=${undo}
        onDone=${() => setToast(null)}
      />`}
    </main>
  `;
}
