# Poké Quiz

A personal web app for quizzing myself on Pokémon names, types, and type matchups. Progress syncs across devices.

- **Server:** Node.js + Express 5
- **Frontend:** Preact + htm, served as plain ES modules (no build step)
- **Database:** Postgres on Neon (Drizzle ORM), coming in milestone 3
- **Hosting:** Render free web service

See [`pokemon-quiz-plan.md`](pokemon-quiz-plan.md) for the full design and milestones.

## Requirements

- Node.js 22+ (developed on the current LTS, installed via [nvm](https://github.com/nvm-sh/nvm))

## Local development

```sh
npm install
cp .env.example .env    # optional until the database milestone
npm run dev             # http://localhost:3000, restarts on file changes
```

Health check: `curl http://localhost:3000/healthz` returns `ok`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the server with file watching, loading `.env` if present |
| `npm start` | Start the server (used by Render) |
| `npm test` | Run tests with Node's built-in test runner |

## How the frontend loads without a build step

Express serves the `preact` and `htm` packages from `node_modules` under `/vendor/*`. An import map in `public/index.html` lets frontend code use normal imports (`import { html } from 'htm/preact'`). To upgrade either library, bump its version in `package.json` and run `npm install`.

## Deployment

Deploy notes (Render + two Neon projects: `poke-quiz-prod` and `poke-quiz-dev`) will be added in milestone 8.
