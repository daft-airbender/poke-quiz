import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The real Play screen in a simulated browser, against a scripted API: the end of a round, as the player sees it.
const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['HTMLElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'Node']) globalThis[key] = dom.window[key];
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;

// Imported after the globals above exist.
const { render } = await import('preact');
const { html } = await import('htm/preact');
const { Play } = await import('../public/screens/Play.js');

after(() => {
  render(null, document.getElementById('app'));
  dom.window.close();
});

const check = (condition, message) => assert.ok(condition, `${message}\nscreen: ${document.body.textContent.replace(/\s+/g, ' ').slice(0, 300)}`);
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (id) => ({ answerType: 'choice', choices: ['Right', 'Wrong'], answer: 'Right', prompt: 'Q' + id, mode: 'x' });
const card = (id, isWrapup = false, waitMs = 0) => ({ id, mode: isWrapup ? 'wrapup' : 'due', isWrapup, waitMs, tier: 'rotation', title: 'C' + id, question: q(id), preview: isWrapup ? null : { 1: '2026-11-02T00:00:00Z', 2: '2026-11-02T00:00:00Z', 3: '2026-11-03T00:00:00Z', 4: '2026-11-09T00:00:00Z' }, serverNow: new Date().toISOString() });
const question = (c, wrapUpPending = 0, answered = 0) => ({ step: 'question', card: c, progress: { label: `${answered} / 2`, answered, dueNow: 0, wrapUpPending } });
const done = { step: 'done', progress: { label: '2 / 2', answered: 2, dueNow: 0, wrapUpPending: 0 } };

function run(length, script, init) {
  const posts = [];
  const finished = { summary: null };
  globalThis.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : undefined;
    const u = String(url);
    let json;
    if (u.endsWith('/answers')) { posts.push(body); json = { result: { correct: body.correct ?? body.rating > 1, transition: null, undo: null, logId: 1 }, next: script.shift() }; }
    else if (u.endsWith('/end')) json = { summary: { ok: true, reason: body.reason } };
    else if (u.includes('/next')) json = script.shift();
    else throw new Error('unexpected ' + u);
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const root = document.getElementById('app');
  render(null, root);
  render(html`<${Play} session=${{ id: 's', kind: 'play', length, startedAt: new Date(Date.now() - (length.expired ? 3600000 : 0)).toISOString() }} initialNext=${init} onFinished=${(s) => (finished.summary = s)} onStartSession=${() => {}} />`, root);
  return { posts, finished };
}
const buttons = () => [...document.querySelectorAll('button')];
const byText = (t) => buttons().find((b) => b.textContent.trim().startsWith(t));
const click = async (t) => { const b = byText(t); if (!b) throw new Error('no button: ' + t + ' | ' + document.body.textContent.replace(/\s+/g, ' ').slice(0, 300)); b.click(); await tick(); };
const has = (t) => document.body.textContent.includes(t);
const hasModal = () => !!document.querySelector('dialog');
const ratingShown = () => ['Hard', 'Good', 'Easy', 'Again'].some((t) => !!byText(t));


test('count round: miss on the last question, review', async () => {
{
  const { posts, finished } = run({ type: 'count', value: 2 }, [question(card(2), 1, 1), question(card(1, true), 2, 2), question(card(2, true), 1, 3), done], question(card(1)));
  await tick();
  await click('Wrong'); await tick();
  check(has('Answer:') && !hasModal(), 'mid-round miss: answer shown, no modal');
  await click('Next'); await tick();
  await click('Wrong'); await tick();
  check(has('Answer:') && !hasModal(), 'last question wrong: the answer stays readable, modal not yet');
  await click('Next'); await tick();
  check(hasModal() && has('That was the last question!') && has("Now let's review the ones you missed."), 'after Next: the modal, with the copy');
  check(buttons().filter((b) => b.closest('dialog')).length === 1 && byText('Start review'), 'exactly one button in it: Start review');
  check(!has('Q2'), 'the finished question is gone behind it');
  await click('Start review');
  check(!hasModal() && has('Q1') && has('Wrap-up'), 'review starts with the missed card, labelled Wrap-up');
  await click('Right'); await tick();
  check(has('Correct!') && byText('Next') && !ratingShown(), 'right in review: Correct! and Next, no difficulty buttons');
  check(posts.at(-1).correct === true && posts.at(-1).rating === undefined && posts.at(-1).isWrapup === true, 'posted correct:true with no rating');
  await click('Next'); await tick();
  check(!hasModal(), 'modal shown only once');
  await click('Wrong'); await tick();
  check(has('Answer:') && byText('Next') && !ratingShown(), 'wrong in review: Answer and Next, no difficulty buttons');
  check(posts.at(-1).correct === false && posts.at(-1).rating === undefined, 'posted correct:false with no rating');
  await click('Next'); await tick();
  check(finished.summary?.reason === 'limit', 'then the results');
}

});

test('count round: right on the last question, earlier miss', async () => {
{
  run({ type: 'count', value: 2 }, [question(card(2), 1, 1), question(card(1, true), 1, 2)], question(card(1)));
  await tick();
  await click('Wrong'); await tick(); await click('Next'); await tick();
  await click('Right'); await tick();
  check(ratingShown() && !hasModal(), 'normal questions still get difficulty buttons');
  await click('Good'); await tick();
  check(hasModal() && has('the one you missed'), 'modal right after rating, singular copy');
}

});

test('no misses', async () => {
{
  const { finished } = run({ type: 'count', value: 1 }, [done], question(card(1)));
  await tick();
  await click('Right'); await tick(); await click('Good'); await tick();
  check(!hasModal() && finished.summary?.reason === 'limit', 'straight to the results, no modal');
}

});

test('timer runs out mid-question', async () => {
{
  const { posts } = run({ type: 'timer', value: 5 }, [question(card(1, true), 1, 1)], question(card(1)));
  await tick();
  check(has('Q1') && !hasModal(), 'question on screen, not interrupted');
  await click('Wrong'); await tick();
  check(posts.length === 1 && posts[0].rating === 1 && !posts[0].isWrapup, 'the late answer is a normal scored miss');
  check(!hasModal() && has('Answer:'), 'answer shown first');
  await click('Next'); await tick();
  check(hasModal() && has("Time's up!") && has('the one you missed'), "then the modal, with Time's up copy");
  // Esc closes the dialog natively; Play must not open End session on top of it.
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tick();
  check(!has('End session?'), 'Esc during the modal does not open End session');
  await click('Start review');
  check(has('Q1') && !hasModal(), 'review starts');
}
{
  const { finished } = run({ type: 'timer', value: 5 }, [done], question(card(1)));
  await tick();
  await click('Right'); await tick(); await click('Good'); await tick();
  check(!hasModal() && finished.summary?.reason === 'limit', 'timer, no misses: straight to results');
}

});

test('End session -> Review N missed: no modal', async () => {
{
  run({ type: 'endless' }, [question(card(2), 1, 1), question(card(1, true), 1, 1)], question(card(1)));
  await tick();
  await click('Wrong'); await tick(); await click('Next'); await tick();
  await click('End session'); await tick();
  await click('Review 1 missed'); await tick();
  check(!has('That was the last question') && !has('Start review') && has('Q1') && has('Wrap-up'), 'they chose the review, so it starts directly');
}

});

test('Free Play review', async () => {
{
  const posts = [];
  (() => {
    const script = [question(card(1, true), 1, 1)];
    globalThis.fetch = async (url, opts) => { const body = opts?.body ? JSON.parse(opts.body) : undefined; if (String(url).endsWith('/answers')) posts.push(body); return new Response(JSON.stringify({ result: { transition: null }, next: String(url).endsWith('/answers') ? script.shift() ?? done : done, summary: {} }), { status: 200 }); };
    const root = document.getElementById('app'); render(null, root);
    render(html`<${Play} session=${{ id: 's', kind: 'free_play', length: { type: 'count', value: 1 }, startedAt: new Date().toISOString() }} initialNext=${question(card(1))} onFinished=${() => {}} onStartSession=${() => {}} />`, root);
  })();
  await tick();
  await click('Wrong'); await tick(); await click('Next'); await tick();
  check(hasModal(), 'modal in Free Play too');
  await click('Start review');
  await click('Right'); await tick(800);
  check(has('Correct!') && !!byText('Next'), 'a right review answer waits for Next instead of auto-advancing');
}
});
