import { render } from 'preact';
import { useState } from 'preact/hooks';
import { html } from 'htm/preact';

// Milestone 1 placeholder: proves Preact + htm load without a build step.
function App() {
  const [clicks, setClicks] = useState(0);

  return html`
    <div class="card">
      <h1>Poké Quiz</h1>
      <p class="muted">Scaffold is up. Quizzes coming soon.</p>
      <button onClick=${() => setClicks(clicks + 1)}>Clicked ${clicks} times</button>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
