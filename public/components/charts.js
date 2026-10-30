// Plain-SVG charts for the Progress screen. Rules (from the data-viz guidance this app follows):
// thin marks, 2px lines, hairline grids, 2px surface gaps between stacked segments, one axis, text in text
// colors (never the series color), a tooltip on hover and keyboard focus, and every value also in a table.
// Colors come from CSS variables (styles.css: --tier-*, --series-1, --chart-*), so light/dark swap in one place.
import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from 'htm/preact';

export const TIERS = [
  { key: 'mastered', label: 'Mastered' },
  { key: 'bank', label: 'Bank' },
  { key: 'rotation', label: 'Rotation' },
  { key: 'unseen', label: 'Unseen' },
];

const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const formatDay = (day) => dayFormat.format(new Date(`${day}T12:00:00Z`));
export const percent = (value) => `${Math.round(value * 100)}%`;

// The rendered width of a container, so charts draw at real pixels (text stays readable on a phone).
function useWidth(fallback = 320) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || fallback));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// One tooltip for a chart: values lead, labels follow; each row keyed by a short stroke of its color.
function Tooltip({ tip, width }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 8), width - 8);
  return html`
    <div class=${`chart-tooltip ${tip.x > width / 2 ? 'left' : ''}`} style=${{ left: `${left}px`, top: `${tip.y}px` }} role="status">
      <div class="chart-tooltip-title">${tip.title}</div>
      ${tip.rows.map(
        (row) => html`
          <div key=${row.label} class="chart-tooltip-row">
            ${row.color && html`<span class="key-line" style=${{ background: row.color }}></span>`}
            <strong>${row.value}</strong><span>${row.label}</span>
          </div>
        `,
      )}
      ${tip.note && html`<div class="chart-tooltip-note">${tip.note}</div>`}
    </div>
  `;
}

export function Legend({ items }) {
  return html`
    <div class="legend">
      ${items.map(
        (item) => html`<span key=${item.label} class="legend-item"><span class=${`swatch-key ${item.line ? 'line' : ''}`} style=${{ background: item.color }}></span>${item.label}</span>`,
      )}
    </div>
  `;
}

// The same numbers as a table, one tap away (never only in a tooltip).
export function TableView({ columns, rows }) {
  return html`
    <details class="table-view">
      <summary>Show as table</summary>
      <div class="table-scroll">
        <table>
          <thead><tr>${columns.map((c) => html`<th key=${c.label} scope="col">${c.label}</th>`)}</tr></thead>
          <tbody>
            ${rows.map((row, i) => html`<tr key=${i}>${columns.map((c) => html`<td key=${c.label}>${c.value(row)}</td>`)}</tr>`)}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

const niceMax = (value) => {
  if (value <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
};
const compact = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace('.0K', 'K') : String(n));

// Crosshair + tooltip for charts with an x position per point (line and area). Pointer or arrow keys.
function useCrosshair(count) {
  const [index, setIndex] = useState(null);
  const onKeyDown = (event) => {
    if (!count) return;
    if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, (i ?? count) - 1));
    else if (event.key === 'ArrowRight') setIndex((i) => Math.min(count - 1, (i ?? -1) + 1));
    else return;
    event.preventDefault();
  };
  return { index, setIndex, keyProps: { tabIndex: 0, onKeyDown, onFocus: () => setIndex(count - 1), onBlur: () => setIndex(null) } };
}

// Collection growth: cards per tier over time, stacked so the total is always every card.
// rows: [{ day, unseen, rotation, bank, mastered }]
export function StackedArea({ rows, height = 200 }) {
  const [ref, width] = useWidth();
  const { index, setIndex, keyProps } = useCrosshair(rows.length);
  const pad = { top: 10, right: 12, bottom: 24, left: 44 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const total = Math.max(...rows.map((r) => r.unseen + r.rotation + r.bank + r.mastered), 1);
  const max = niceMax(total);
  const x = (i) => pad.left + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - (v / max) * plotH;

  // Bottom-up: mastered, bank, rotation, then unseen as the unfilled track on top.
  let base = rows.map(() => 0);
  const layers = TIERS.map((tier) => {
    const top = rows.map((r, i) => base[i] + r[tier.key]);
    const path = [...rows.map((_, i) => `${x(i)},${y(top[i])}`), ...rows.map((_, i) => `${x(rows.length - 1 - i)},${y(base[rows.length - 1 - i])}`)];
    base = top;
    return { ...tier, d: `M${path.join('L')}Z` };
  });
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(rows.length / 4));

  function move(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left - pad.left;
    setIndex(Math.max(0, Math.min(rows.length - 1, Math.round((px / plotW) * (rows.length - 1)))));
  }

  const row = index !== null ? rows[index] : null;
  return html`
    <div class="chart" ref=${ref}>
      <svg width=${width} height=${height} role="img" aria-label="Cards per tier over time. Use the arrow keys for each date." ...${keyProps}
        onPointerMove=${move} onPointerLeave=${() => setIndex(null)}>
        ${ticks.map((t) => html`<g key=${t}><line class="grid" x1=${pad.left} x2=${width - pad.right} y1=${y(t)} y2=${y(t)} /><text class="tick" x=${pad.left - 6} y=${y(t) + 4} text-anchor="end">${compact(t)}</text></g>`)}
        ${layers.map((layer) => html`<path key=${layer.key} d=${layer.d} class=${`area tier-${layer.key}`} />`)}
        ${rows.map((r, i) => (i % labelEvery === 0 || i === rows.length - 1) && html`<text key=${r.day} class="tick" x=${x(i)} y=${height - 6} text-anchor=${i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}>${formatDay(r.day)}</text>`)}
        ${row && html`<line class="crosshair" x1=${x(index)} x2=${x(index)} y1=${pad.top} y2=${pad.top + plotH} />`}
      </svg>
      <${Tooltip}
        width=${width}
        tip=${row && {
          x: x(index),
          y: pad.top,
          title: formatDay(row.day),
          rows: TIERS.map((t) => ({ label: t.label, value: row[t.key].toLocaleString(), color: `var(--tier-${t.key})` })),
        }}
      />
    </div>
  `;
}

// A weekly rate (0-1) as a line with a dashed target line. Weeks with little data are drawn faded and say so.
// points: [{ week, value, correct, total, low }]
export function RateLine({ points, target, height = 180, unit = 'correct' }) {
  const [ref, width] = useWidth();
  const { index, setIndex, keyProps } = useCrosshair(points.length);
  const pad = { top: 12, right: 12, bottom: 24, left: 40 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - v * plotH;
  const solid = points.map((p, i) => ({ ...p, i })).filter((p) => !p.low);
  const line = solid.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.value)}`).join('');
  const labelEvery = Math.max(1, Math.ceil(points.length / 4));

  function move(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left - pad.left;
    setIndex(Math.max(0, Math.min(points.length - 1, Math.round((px / plotW) * (points.length - 1)))));
  }

  const point = index !== null ? points[index] : null;
  return html`
    <div class="chart" ref=${ref}>
      <svg width=${width} height=${height} role="img" aria-label="Weekly percentage. Use the arrow keys for each week." ...${keyProps}
        onPointerMove=${move} onPointerLeave=${() => setIndex(null)}>
        ${[0, 0.5, 1].map((t) => html`<g key=${t}><line class="grid" x1=${pad.left} x2=${width - pad.right} y1=${y(t)} y2=${y(t)} /><text class="tick" x=${pad.left - 6} y=${y(t) + 4} text-anchor="end">${percent(t)}</text></g>`)}
        ${target != null && html`
          <line class="target" x1=${pad.left} x2=${width - pad.right} y1=${y(target)} y2=${y(target)} />
          <text class="tick" x=${width - pad.right} y=${y(target) - 4} text-anchor="end">Target ${percent(target)}</text>
        `}
        ${line && html`<path class="series-line" d=${line} />`}
        ${points.map((p, i) => html`<circle key=${p.week} class=${`series-dot ${p.low ? 'low' : ''}`} cx=${x(i)} cy=${y(p.value)} r="4" />`)}
        ${points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && html`<text key=${p.week} class="tick" x=${x(i)} y=${height - 6} text-anchor=${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>${formatDay(p.week)}</text>`)}
        ${point && html`<line class="crosshair" x1=${x(index)} x2=${x(index)} y1=${pad.top} y2=${pad.top + plotH} />`}
      </svg>
      <${Tooltip}
        width=${width}
        tip=${point && {
          x: x(index),
          y: pad.top,
          title: `Week of ${formatDay(point.week)}`,
          rows: [{ label: `${point.correct} of ${point.total} ${unit}`, value: percent(point.value), color: 'var(--series-1)' }],
          note: point.low ? 'Low data: fewer than 10 answers' : null,
        }}
      />
    </div>
  `;
}

// Horizontal bars, one per category, stacked by tier (100% = every card in it). Tapping a bar selects it.
// rows: [{ key, label, unseen, rotation, bank, mastered }]
export function TierBars({ rows, onSelect }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const labelW = Math.min(150, width * 0.38);
  const valueW = 44;
  const barW = Math.max(10, width - labelW - valueW - 12);
  const rowH = 30;
  const order = ['mastered', 'bank', 'rotation', 'unseen'];

  function show(row, i, event) {
    setTip({
      x: labelW + barW / 2,
      y: i * rowH + rowH,
      title: row.label,
      rows: TIERS.map((t) => ({ label: t.label, value: row[t.key].toLocaleString(), color: `var(--tier-${t.key})` })),
      note: event?.type === 'focus' ? 'Enter opens these cards' : 'Tap to see these cards',
    });
  }

  return html`
    <div class="chart" ref=${ref}>
      <svg width=${width} height=${rows.length * rowH} role="list" aria-label="Share of each category by tier">
        ${rows.map((row, i) => {
          const total = order.reduce((n, k) => n + row[k], 0) || 1;
          const learned = (row.bank + row.mastered) / total;
          let at = labelW;
          return html`
            <g key=${row.key} class="bar-row" role="listitem" tabIndex="0" aria-label=${`${row.label}: ${percent(learned)} banked or mastered`}
              onPointerEnter=${(e) => show(row, i, e)} onPointerLeave=${() => setTip(null)} onFocus=${(e) => show(row, i, e)} onBlur=${() => setTip(null)}
              onClick=${() => onSelect?.(row)} onKeyDown=${(e) => e.key === 'Enter' && onSelect?.(row)}>
              <rect class="hit" x="0" y=${i * rowH} width=${width} height=${rowH} />
              <text class="bar-label" x="0" y=${i * rowH + rowH / 2 + 4}>${row.label}</text>
              ${order.map((key) => {
                const w = (row[key] / total) * barW;
                const rect = w > 0 && html`<rect key=${key} class=${`tier-${key}`} x=${at} y=${i * rowH + 8} width=${Math.max(0, w - (key === 'unseen' ? 0 : 2))} height=${rowH - 16} rx="2" />`;
                at += w;
                return rect;
              })}
              <text class="bar-value" x=${width} y=${i * rowH + rowH / 2 + 4} text-anchor="end">${percent(learned)}</text>
            </g>
          `;
        })}
      </svg>
      <${Tooltip} width=${width} tip=${tip} />
    </div>
  `;
}

// Horizontal bars of a percentage (Free Play accuracy). rows: [{ key, label, correct, answered }]
export function RateBars({ rows }) {
  const [ref, width] = useWidth();
  const labelW = Math.min(150, width * 0.38);
  const valueW = 64;
  const barW = Math.max(10, width - labelW - valueW - 12);
  const rowH = 28;
  return html`
    <div class="chart" ref=${ref}>
      <svg width=${width} height=${rows.length * rowH} role="list" aria-label="Accuracy by category">
        ${rows.map((row, i) => {
          const value = row.answered ? row.correct / row.answered : 0;
          return html`
            <g key=${row.key} role="listitem" aria-label=${`${row.label}: ${percent(value)} of ${row.answered}`}>
              <text class="bar-label" x="0" y=${i * rowH + rowH / 2 + 4}>${row.label}</text>
              <rect class="bar-track" x=${labelW} y=${i * rowH + 9} width=${barW} height=${rowH - 18} rx="2" />
              <rect class="series-bar" x=${labelW} y=${i * rowH + 9} width=${Math.max(2, value * barW)} height=${rowH - 18} rx="2" />
              <text class="bar-value" x=${width} y=${i * rowH + rowH / 2 + 4} text-anchor="end">${percent(value)} · ${row.answered}</text>
            </g>
          `;
        })}
      </svg>
    </div>
  `;
}

// Activity calendar: one square per day for the last 53 weeks, shaded by answers (none + 4 levels from my
// own range); the current streak's days are ringed. days: [{ day, play, freePlay, correct, level }]
export function ActivityCalendar({ days, streakDays, today }) {
  const scroller = useRef(null);
  const [tip, setTip] = useState(null);
  const cell = 12;
  const gap = 3;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const streak = new Set(streakDays);
  // Columns are weeks (Monday first); the last column holds today.
  const end = new Date(`${today}T12:00:00Z`);
  const weekday = (end.getUTCDay() + 6) % 7;
  const start = new Date(end.getTime() - (52 * 7 + weekday) * 864e5);
  const cells = [];
  for (let t = start.getTime(), i = 0; t <= end.getTime(); t += 864e5, i++) {
    const day = new Date(t).toISOString().slice(0, 10);
    cells.push({ day, col: Math.floor(i / 7), row: i % 7, data: byDay.get(day) });
  }
  const width = 53 * (cell + gap);
  const height = 7 * (cell + gap);

  // Show the most recent weeks first on a narrow screen.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);

  function show(c) {
    const answered = (c.data?.play ?? 0) + (c.data?.freePlay ?? 0);
    setTip({
      x: Math.min(c.col * (cell + gap) - (scroller.current?.scrollLeft ?? 0), (scroller.current?.clientWidth ?? width) - 8),
      y: c.row * (cell + gap) + cell + 4,
      title: formatDay(c.day),
      rows: answered
        ? [
            { label: 'answered', value: answered.toLocaleString() },
            { label: 'in Play', value: (c.data.play ?? 0).toLocaleString() },
            { label: 'in Free Play', value: (c.data.freePlay ?? 0).toLocaleString() },
            { label: 'correct', value: percent(c.data.correct / answered) },
          ]
        : [{ label: 'no answers', value: '0' }],
      note: streak.has(c.day) ? 'Part of your current streak' : null,
    });
  }

  return html`
    <div class="chart">
      <div class="calendar-scroll" ref=${scroller}>
        <svg width=${width} height=${height} role="grid" aria-label="Answers per day over the last year">
          ${cells.map(
            (c) => html`
              <rect key=${c.day} class=${`day-cell level-${c.data?.level ?? 0} ${streak.has(c.day) ? 'streak' : ''}`}
                x=${c.col * (cell + gap)} y=${c.row * (cell + gap)} width=${cell} height=${cell} rx="2" tabIndex="-1"
                onPointerEnter=${() => show(c)} onPointerLeave=${() => setTip(null)} />
            `,
          )}
        </svg>
      </div>
      <${Tooltip} width=${scroller.current?.clientWidth ?? 320} tip=${tip} />
    </div>
  `;
}
