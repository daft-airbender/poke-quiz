import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 3000;

const app = express();

// Render terminates TLS at its proxy; needed for secure cookies and real client IPs.
app.set('trust proxy', 1);
app.use(express.json());

// Health check for Render. No auth, no DB hit.
app.get('/healthz', (req, res) => {
  res.type('text').send('ok');
});

// Frontend libraries, served straight from node_modules (no build step, no CDN).
// public/index.html maps bare imports like 'preact' to these paths via an import map.
app.use('/vendor/preact', express.static(path.join(rootDir, 'node_modules/preact')));
app.use('/vendor/htm', express.static(path.join(rootDir, 'node_modules/htm')));

app.use(express.static(path.join(rootDir, 'public')));

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
