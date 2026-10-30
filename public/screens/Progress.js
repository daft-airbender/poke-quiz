import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { api } from '../api.js';
import { ActivityCalendar, formatDay, Legend, percent, RateBars, RateLine, StackedArea, TableView, TierBars, TIERS } from '../components/charts.js';
import { Spinner } from '../components/Loader.js';
import { KIND_LABELS } from '../format.js';
import { activityLevels, fillDays, lastDayPerWeek, shiftDay } from '../../shared/progressMath.js';

const LOW_DATA = 10; // weeks with fewer answers are faded and labeled "low data"
const RANGES = [
  ['1m', '1 month', 31],
  ['3m', '3 months', 92],
  ['1y', '1 year', 366],
  ['all', 'All', Infinity],
];
const TARGET = 0.9; // desired retention
const dateTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
// Daily rows with gaps carried forward (no change on days without activity); weekly past three months.
function growthRows(rows, range, today) {
  if (!rows.length) return [];
  const days = RANGES.find(([id]) => id === range)[2];
  const from = days === Infinity ? rows[0].day : shiftDay(today, -(days - 1));
  const filled = fillDays(rows, rows[0].day, today).filter((row) => row.day >= from);
  return days <= 92 ? filled : lastDayPerWeek(filled);
}

// The calendar's shades: none, then four levels by my own range.
function withLevels(days) {
  const level = activityLevels(days.map((d) => d.play + d.freePlay));
  return days.map((d) => ({ ...d, level: level(d.play + d.freePlay) }));
}

function Stat({ label, value, detail }) {
  return html`
    <div class="stat-tile">
      <span class="stat-tile-label">${label}</span>
      <span class="stat-tile-value">${value}</span>
      ${detail && html`<span class="small muted">${detail}</span>`}
    </div>
  `;
}

function Empty({ children }) {
  return html`<p class="chart-empty">${children}</p>`;
}

// The Progress screen (spec: "Progress screen"). Learning numbers come from Play only; Free Play has its own
// panel and only counts toward the calendar and streak.
export function Progress({ onOpenCards }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState('3m');

  async function load() {
    setError('');
    try {
      setStats(await api('/api/progress/stats'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return html`
      <main class="card stack">
        <p class="error" role="alert">${error}</p>
        <button type="button" class="primary full" onClick=${load}>Try again</button>
      </main>
    `;
  }
  if (!stats) return html`<main class="card"><${Spinner} label="Loading progress…" /></main>`;

  const { headline, today } = stats;
  const growth = growthRows(stats.growth, range, today);
  const recall = stats.recall.map((w) => ({ week: w.week, value: w.correct / w.qualifying, correct: w.correct, total: w.qualifying, low: w.qualifying < LOW_DATA }));
  const fpWeeks = stats.freePlay.weeks.map((w) => ({ week: w.week, value: w.correct / w.answered, correct: w.correct, total: w.answered, low: w.answered < LOW_DATA }));
  const activity = withLevels(stats.activity);
  const recallWeek = headline.recallThisWeek;
  const tierLegend = TIERS.map((t) => ({ label: t.label, color: `var(--tier-${t.key})` }));
  const tierColumns = [
    ...TIERS.map((t) => ({ label: t.label, value: (r) => r[t.key].toLocaleString() })),
    { label: 'Banked or mastered', value: (r) => percent((r.bank + r.mastered) / (r.unseen + r.rotation + r.bank + r.mastered || 1)) },
  ];

  return html`
    <main class="stack">
      <section class="stat-row" aria-label="Headline numbers">
        <${Stat} label="Mastered" value=${headline.mastered.toLocaleString()} detail=${`+${headline.masteredThisWeek} this week`} />
        <${Stat} label="Streak" value=${`${headline.streak} ${headline.streak === 1 ? 'day' : 'days'}`} detail=${headline.streak ? 'in a row' : 'play today to start one'} />
        <${Stat}
          label="Recall this week"
          value=${recallWeek.qualifying ? percent(recallWeek.correct / recallWeek.qualifying) : '—'}
          detail=${recallWeek.qualifying ? `${recallWeek.correct} of ${recallWeek.qualifying}${recallWeek.qualifying < LOW_DATA ? ' · low data' : ''}` : 'no reviews due yet'}
        />
      </section>

      <section class="card stack">
        <div>
          <h2>Collection growth</h2>
          <p class="small muted">Every card, by tier, at the end of each day.</p>
        </div>
        <div class="chips" role="group" aria-label="Range">
          ${RANGES.map(
            ([id, label]) => html`<button key=${id} type="button" class=${`chip ${range === id ? 'is-selected' : ''}`} aria-pressed=${range === id} onClick=${() => setRange(id)}>${label}</button>`,
          )}
        </div>
        ${growth.length < 2
          ? html`<${Empty}>Play on a couple of days to see your collection grow.<//>`
          : html`
              <${Legend} items=${tierLegend} />
              <${StackedArea} rows=${growth} />
              <${TableView} columns=${[{ label: 'Day', value: (r) => formatDay(r.day) }, ...tierColumns]} rows=${[...growth].reverse()} />
            `}
      </section>

      <section class="card stack">
        <div>
          <h2>True recall rate</h2>
          <p class="small muted">
            Right answers on real tests of memory: due reviews and bank check-ins, a day or more after the card was last seen. The target is ${percent(TARGET)}.
          </p>
        </div>
        ${recall.length === 0
          ? html`<${Empty}>Play a few days to see your recall rate. It counts reviews that come due a day or more later.<//>`
          : html`
              <${RateLine} points=${recall} target=${TARGET} />
              <p class="small muted">Faded weeks have fewer than ${LOW_DATA} answers (low data).</p>
              <${TableView}
                columns=${[
                  { label: 'Week of', value: (p) => formatDay(p.week) },
                  { label: 'Recall', value: (p) => percent(p.value) },
                  { label: 'Correct', value: (p) => `${p.correct} of ${p.total}` },
                  { label: '', value: (p) => (p.low ? 'low data' : '') },
                ]}
                rows=${[...recall].reverse()}
              />
            `}
      </section>

      <section class="card stack">
        <div>
          <h2>By mode</h2>
          <p class="small muted">Each bar is all of a mode's cards; the number is the share banked or mastered. Tap a bar to see its cards.</p>
        </div>
        <${Legend} items=${tierLegend} />
        <${TierBars} rows=${stats.categories.modes.map((m) => ({ key: m.id, ...m }))} onSelect=${(row) => onOpenCards({ mode: row.key })} />
        <${TableView} columns=${[{ label: 'Mode', value: (r) => r.label }, ...tierColumns]} rows=${stats.categories.modes} />
        <h2>By generation</h2>
        <p class="small muted">Type-chart cards (Effectiveness, Counters) aren't tied to a generation, so they only count above.</p>
        <${TierBars}
          rows=${stats.categories.generations.map((g) => ({ key: g.generation, label: `Gen ${g.generation}`, ...g }))}
          onSelect=${(row) => onOpenCards({ gen: String(row.key) })}
        />
        <${TableView} columns=${[{ label: 'Generation', value: (r) => `Gen ${r.generation}` }, ...tierColumns]} rows=${stats.categories.generations} />
      </section>

      <section class="card stack">
        <div>
          <h2>Activity</h2>
          <p class="small muted">Answers per day over the last year, Play and Free Play. Your current streak is outlined.</p>
        </div>
        <${ActivityCalendar} days=${activity} streakDays=${stats.streakDays} today=${today} />
        <div class="legend">
          <span class="small muted">Less</span>
          ${[0, 1, 2, 3, 4].map((level) => html`<span key=${level} class=${`swatch-key level-${level}`}></span>`)}
          <span class="small muted">More</span>
        </div>
        ${activity.length > 0 &&
        html`<${TableView}
          columns=${[
            { label: 'Day', value: (d) => formatDay(d.day) },
            { label: 'Play', value: (d) => d.play },
            { label: 'Free Play', value: (d) => d.freePlay },
            { label: 'Correct', value: (d) => percent(d.correct / (d.play + d.freePlay)) },
          ]}
          rows=${[...activity].reverse()}
        />`}
      </section>

      <section class="card stack free-play-panel">
        <div>
          <h2>Free Play</h2>
          <p class="small muted">Separate from your learning: Free Play never changes what Play schedules.</p>
        </div>
        ${stats.freePlay.allTime.answered === 0
          ? html`<${Empty}>No Free Play yet. Its accuracy and most-missed cards will show here.<//>`
          : html`
              <div class="stat-row">
                <${Stat}
                  label="This week"
                  value=${stats.freePlay.thisWeek.answered ? percent(stats.freePlay.thisWeek.correct / stats.freePlay.thisWeek.answered) : '—'}
                  detail=${`${stats.freePlay.thisWeek.answered} answered`}
                />
                <${Stat}
                  label="All time"
                  value=${percent(stats.freePlay.allTime.correct / stats.freePlay.allTime.answered)}
                  detail=${`${stats.freePlay.allTime.answered.toLocaleString()} answered`}
                />
              </div>
              <h3 class="small muted">Accuracy over time</h3>
              <${RateLine} points=${fpWeeks} />
              <${TableView}
                columns=${[
                  { label: 'Week of', value: (p) => formatDay(p.week) },
                  { label: 'Accuracy', value: (p) => percent(p.value) },
                  { label: 'Correct', value: (p) => `${p.correct} of ${p.total}` },
                  { label: '', value: (p) => (p.low ? 'low data' : '') },
                ]}
                rows=${[...fpWeeks].reverse()}
              />
              <h3 class="small muted">Accuracy by mode</h3>
              <${RateBars} rows=${stats.freePlay.byMode.map((m) => ({ key: m.id, ...m }))} />
              ${stats.freePlay.byGeneration.length > 0 &&
              html`
                <h3 class="small muted">Accuracy by generation</h3>
                <${RateBars} rows=${stats.freePlay.byGeneration.map((g) => ({ key: g.generation, label: `Gen ${g.generation}`, ...g }))} />
              `}
              <h3 class="small muted">Most missed in Free Play</h3>
              <ul class="missed-list">
                ${stats.freePlay.mostMissed.map(
                  (card) => html`
                    <li key=${card.id}>
                      ${card.sprite ? html`<img src=${card.sprite} alt="" width="48" height="48" />` : html`<span class="sprite-placeholder" aria-hidden="true"></span>`}
                      <div>
                        <div>${card.title}</div>
                        <div class="small muted">missed ${card.missed} of ${card.answered}</div>
                      </div>
                    </li>
                  `,
                )}
              </ul>
            `}
      </section>

      <section class="card stack">
        <h2>Recent sessions</h2>
        ${stats.recentSessions.length === 0
          ? html`<${Empty}>No sessions yet.<//>`
          : html`<ul class="stat-list">
              ${stats.recentSessions.map(
                (session, i) => html`
                  <li key=${i}>
                    <div>
                      <div>${KIND_LABELS[session.kind] ?? session.kind}</div>
                      <div class="small muted">${dateTime.format(new Date(session.startedAt))}</div>
                    </div>
                    <span class="stat">${session.correct} / ${session.answered}</span>
                  </li>
                `,
              )}
            </ul>`}
      </section>
    </main>
  `;
}
