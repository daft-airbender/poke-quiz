import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { ACTION_LABELS, CardDetails, TIER_LABELS } from '../components/CardDetails.js';
import { Spinner } from '../components/Loader.js';
import { Modal } from '../components/Modal.js';
import { Toast } from '../components/Toast.js';

const TABS = [
  ['rotation', 'Rotation'],
  ['bank', 'Bank'],
  ['mastered', 'Mastered'],
  ['trouble', 'Trouble'],
  ['all', 'All cards'],
];
const SORTS = [
  ['fading', 'Fading first'],
  ['strongest', 'Strongest first'],
  ['name', 'A–Z'],
];
// Bulk actions offered on each tab (the server skips cards an action doesn't apply to).
const BULK_ACTIONS = {
  rotation: ['move_to_bank', 'mark_mastered'],
  bank: ['restore', 'mark_mastered'],
  mastered: ['restore', 'demote'],
  trouble: ['restore', 'move_to_bank', 'mark_mastered'],
  all: ['move_to_bank', 'mark_mastered'],
};
const TAB_NOTES = {
  rotation: 'Cards in normal reviews.',
  bank: 'Probably memorized: out of normal reviews, back for a check-in when recall drops below 80%.',
  mastered: 'Proven memorized: never shown in Play unless you bring them back.',
  trouble: 'Cards missed 8 or more times after being learned.',
  all: 'Every card, including ones you haven’t seen yet.',
};

// Browse cards by tier, search and filter them, and move them between tiers (spec: "Screens and actions").
export function Cards({ modes, generations, initialTab = 'rotation', onPractice }) {
  const [tab, setTab] = useState(initialTab);
  const [filters, setFilters] = useState({ q: '', mode: '', gen: '' });
  const [sort, setSort] = useState('fading');
  const [page, setPage] = useState(null); // { total, cards }
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [openCard, setOpenCard] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [toast, setToast] = useState(null);
  const request = useRef(0);

  const query = (offset) => {
    const params = new URLSearchParams({ tier: tab, sort, offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return `/api/cards?${params}`;
  };

  async function load() {
    const id = ++request.current; // ignore answers to older searches
    setError('');
    try {
      const result = await api(query(0));
      if (id === request.current) setPage(result);
    } catch (err) {
      if (id === request.current) setError(err.message);
    }
  }

  // Reload when the tab, filters or sort change; typing in search waits a moment.
  useEffect(() => {
    setPage(null);
    const timer = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [tab, filters, sort]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const more = await api(query(page.cards.length));
      setPage({ ...more, cards: [...page.cards, ...more.cards] });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function changed(message) {
    setOpenCard(null);
    setBulk(false);
    setToast(message);
    load();
  }

  const modeLabel = (id) => modes.find((m) => m.id === id)?.label ?? id;
  const update = (changes) => setFilters({ ...filters, ...changes });

  return html`
    <main class="stack">
      <div class="chips tabs" role="tablist">
        ${TABS.map(
          ([id, label]) => html`
            <button key=${id} type="button" role="tab" aria-selected=${tab === id} class=${`chip ${tab === id ? 'is-selected' : ''}`} onClick=${() => setTab(id)}>
              ${label}
            </button>
          `,
        )}
      </div>
      <p class="muted small">${TAB_NOTES[tab]}</p>

      <section class="card stack">
        <input class="search" type="search" placeholder="Search" aria-label="Search cards" value=${filters.q} onInput=${(e) => update({ q: e.currentTarget.value })} />
        <div class="filters">
          <select aria-label="Mode" value=${filters.mode} onChange=${(e) => update({ mode: e.currentTarget.value })}>
            <option value="">All modes</option>
            ${modes.map((m) => html`<option key=${m.id} value=${m.id}>${m.label}</option>`)}
          </select>
          <select aria-label="Generation" value=${filters.gen} onChange=${(e) => update({ gen: e.currentTarget.value })}>
            <option value="">All generations</option>
            ${generations.map((g) => html`<option key=${g} value=${g}>Gen ${g}</option>`)}
          </select>
          <select aria-label="Sort" value=${sort} onChange=${(e) => setSort(e.currentTarget.value)}>
            ${SORTS.map(([id, label]) => html`<option key=${id} value=${id}>${label}</option>`)}
          </select>
        </div>
      </section>

      ${(tab === 'bank' || tab === 'mastered') &&
      html`<button type="button" class="primary full" onClick=${() => onPractice(tab === 'bank' ? 'bank_practice' : 'mastered_practice')}>
        ${tab === 'bank' ? 'Practice the bank' : 'Practice mastered'}
      </button>`}

      ${error && html`<p class="error" role="alert">${error}</p>`}
      ${!page && !error && html`<section class="card"><${Spinner} /></section>`}
      ${page &&
      html`
        <section class="card stack">
          <div class="row-between">
            <h2>${page.total.toLocaleString()} ${page.total === 1 ? 'card' : 'cards'}</h2>
            ${page.total > 0 && html`<button type="button" class="link" onClick=${() => setBulk(true)}>Bulk actions</button>`}
          </div>
          ${page.total === 0 && html`<p class="muted">Nothing here${filters.q || filters.mode || filters.gen ? ' with these filters' : ' yet'}.</p>`}
          <ul class="card-list">
            ${page.cards.map(
              (card) => html`
                <li key=${card.id}>
                  <button type="button" class="card-row" onClick=${() => setOpenCard(card.id)}>
                    ${card.sprite ? html`<img src=${card.sprite} alt="" width="48" height="48" />` : html`<span class="sprite-placeholder" aria-hidden="true"></span>`}
                    <span class="card-row-main">
                      <span class="card-row-title">${card.title}${card.isLeech && html` <span class="badge">Trouble</span>`}</span>
                      <span class="small muted">${modeLabel(card.cardType)}${tab === 'all' || tab === 'trouble' ? ` · ${TIER_LABELS[card.tier]}` : ''}</span>
                    </span>
                    <span class="card-row-r">${card.r === null ? '—' : `${Math.round(card.r * 100)}%`}</span>
                  </button>
                </li>
              `,
            )}
          </ul>
          ${page.cards.length < page.total &&
          html`<button type="button" class="secondary full" disabled=${loadingMore} onClick=${loadMore}>
            ${loadingMore ? 'Loading…' : `Show more (${(page.total - page.cards.length).toLocaleString()} left)`}
          </button>`}
          ${page.total > 0 && html`<p class="small muted">The percentage is each card's chance of being remembered right now.</p>`}
        </section>
      `}

      ${openCard && html`<${CardDetails} cardId=${openCard} modes=${modes} onClose=${() => setOpenCard(null)} onChanged=${changed} />`}
      ${bulk &&
      html`<${BulkActions} tab=${tab} total=${page.total} filters=${{ tier: tab, ...filters }} onClose=${() => setBulk(false)} onDone=${changed} />`}
      ${toast && html`<${Toast} message=${toast} onDone=${() => setToast(null)} />`}
    </main>
  `;
}

// Apply one action to every card in the current list, or to N of them at random.
function BulkActions({ tab, total, filters, onClose, onDone }) {
  const [action, setAction] = useState(BULK_ACTIONS[tab][0]);
  const [which, setWhich] = useState('all'); // all | random
  const [count, setCount] = useState(String(Math.min(10, total)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const n = Number(count);
  const validCount = which === 'all' || (Number.isInteger(n) && n >= 1 && n <= Math.min(total, 1000));

  async function apply() {
    setBusy(true);
    setError('');
    const body = { action, filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(which === 'random' && { count: n }) };
    try {
      const { changed } = await api('/api/cards/bulk', { method: 'POST', body });
      onDone(`${ACTION_LABELS[action]}: ${changed} ${changed === 1 ? 'card' : 'cards'}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return html`
    <${Modal} title="Bulk actions" onClose=${onClose}>
      <p class="small muted">Applies to the cards in this list (its tab, search and filters). Cards an action doesn't fit are skipped.</p>
      <div class="chips">
        ${BULK_ACTIONS[tab].map(
          (a) => html`<button key=${a} type="button" class=${`chip ${action === a ? 'is-selected' : ''}`} aria-pressed=${action === a} onClick=${() => setAction(a)}>${ACTION_LABELS[a]}</button>`,
        )}
      </div>
      <div class="chips">
        <button type="button" class=${`chip ${which === 'all' ? 'is-selected' : ''}`} aria-pressed=${which === 'all'} onClick=${() => setWhich('all')}>All ${total.toLocaleString()}</button>
        <button type="button" class=${`chip ${which === 'random' ? 'is-selected' : ''}`} aria-pressed=${which === 'random'} onClick=${() => setWhich('random')}>Some at random</button>
      </div>
      ${which === 'random' &&
      html`<label class="field">How many?<input type="text" inputmode="numeric" value=${count} onInput=${(e) => setCount(e.currentTarget.value.replace(/\D/g, ''))} /></label>`}
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button type="button" class="primary full" disabled=${busy || !validCount} onClick=${apply}>
        ${busy ? 'Working…' : `${ACTION_LABELS[action]} (${which === 'all' ? total.toLocaleString() : count || 0})`}
      </button>
      <button type="button" class="secondary full" onClick=${onClose}>Cancel</button>
    <//>
  `;
}
