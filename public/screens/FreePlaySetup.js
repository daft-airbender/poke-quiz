import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { LengthPicker } from '../components/LengthPicker.js';
import { ScopePicker } from '../components/ScopePicker.js';
import { lengthLabel } from '../format.js';

// Free Play: pick what to quiz on and for how long. Nothing here touches learning progress.
// The filters and length start from the last Free Play's.
export function FreePlaySetup({ modes, generations, filter, length, onStart, onSaveLength, onBack }) {
  const [scope, setScope] = useState(filter);
  const [currentLength, setCurrentLength] = useState(length);
  const [picking, setPicking] = useState(false);
  const noModes = scope.modes?.length === 0;

  async function pickLength(next) {
    setPicking(false);
    setCurrentLength(next);
    await onSaveLength('free_play', next);
  }

  return html`
    <main class="stack">
      <section class="card stack">
        <div>
          <h2>Free Play</h2>
          <p class="small muted">Quiz yourself on anything. Free Play never changes what Play schedules, banks or masters.</p>
        </div>
        <${ScopePicker} modes=${modes} generations=${generations} scope=${scope} onChange=${setScope} />
      </section>
      <section class="stack">
        <button type="button" class="primary full large" disabled=${noModes} onClick=${() => onStart(currentLength, scope)}>Start</button>
        <button type="button" class="length-control" aria-haspopup="dialog" onClick=${() => setPicking(true)}>
          ${lengthLabel(currentLength)} <span aria-hidden="true">▾</span>
        </button>
      </section>
      <button type="button" class="secondary full" onClick=${onBack}>Back</button>
      ${picking && html`<${LengthPicker} value=${currentLength} onPick=${pickLength} onClose=${() => setPicking(false)} />`}
    </main>
  `;
}
