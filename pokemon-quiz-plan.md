# Pokémon Quiz App — Project Plan

> Briefing for Claude Code. Read this whole file before writing code. Where something is marked **Decision**, it's already settled; where marked **Default**, use it unless I say otherwise. Ask before deviating from either.

## 1. What we're building

A personal web app for quizzing myself on:
- Pokémon **names** (from sprites)
- Pokémon **types**
- **Type effectiveness** (super effective / not very effective / no effect)

It's for me only. Progress must sync across devices (phone + laptop), which is why it has a backend and a database instead of being a static site.

### Goals
- Fast, mobile-friendly quiz UI
- Login for a single account (me); **no registration**
- Progress stored server-side so it follows me across devices
- Runs entirely on free tiers: **Render** (app) + **Neon** (Postgres)

### Non-goals (for now)
- Signup, password reset, OAuth, multiple users
- Admin panel
- Native app / PWA offline mode
- Anything beyond names, types, and type matchups

## 2. Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js (LTS), ES modules — **Default** |
| Server | Express 5 — **Default** |
| DB | Postgres on Neon — **Decision** |
| ORM / migrations | Drizzle ORM; `drizzle-kit` (devDependency) only for `db:generate`; migrations applied by `scripts/migrate.js` using `drizzle-orm`'s built-in migrator — **Decision** |
| DB driver | `pg` (node-postgres) using Neon's **pooled** connection string — **Default** |
| Password hashing | `bcrypt` (cost 12) — **Default** |
| Sessions | `cookie-session` (signed, stateless cookie) — **Default** |
| Rate limiting | `express-rate-limit` on `POST /api/login` — **Decision** |
| Frontend | **Preact + `htm`**, no build step, served as static ES modules by the same Express app — **Decision** |
| Hosting | Render free web service, single service serves API + frontend — **Decision** |
| Tests | Node built-in test runner (`node --test`) — **Default** |

Keep dependencies minimal. **No frontend build step.**

### Frontend without a build step
- `preact` and `htm` are regular npm dependencies (versions pinned in `package.json`).
- Express serves their ESM files from `node_modules` under `/vendor/*` (e.g. `/vendor/preact/`, `/vendor/htm/`). Nothing is copied or committed, and no CDN is used at runtime.
- `public/index.html` declares an **import map** so frontend code can write `import { h, render } from 'preact'`, `import { useState } from 'preact/hooks'`, `import { html } from 'htm/preact'`.
- Components use `htm` tagged templates (`` html`<${Choice} label=${x} />` ``) instead of JSX. The API matches React, so a later move to React + a bundler is mostly import changes.

**Why Preact + htm (not React + Vite):** more quiz modes and a settings screen are planned, so a component model pays off, but Preact is ~5 KB vs ~45–60 KB for React and needs no bundler/toolchain on every deploy.

## 3. Architecture

```
Browser ──HTTPS──> Render web service (Express)
                     ├── /           static frontend (public/)
                     ├── /api/*      JSON API (session required except /login)
                     └── /healthz    health check
                           │
                           └──> Neon Postgres (users, progress, sessions history)
```

- One service = one deploy, same origin, no CORS.
- Pokémon data and the type chart are **static JSON in the repo**, not in the DB. The DB only holds user + progress data.

## 4. Project structure

The repo root is this directory (`pokemon-quiz-app/`).

```
pokemon-quiz-app/
├── package.json
├── render.yaml
├── drizzle.config.js
├── .env.example
├── .gitignore                # .env, node_modules
├── README.md
├── data/
│   ├── pokemon.json          # generated, committed
│   └── type-chart.json       # hand-written, committed
├── scripts/
│   ├── fetch-pokemon.js      # one-off: builds data/pokemon.json from PokéAPI
│   ├── create-user.js        # one-off: creates my account
│   └── migrate.js            # applies drizzle/ migrations (used by Render build)
├── src/
│   ├── server.js             # app entry
│   ├── db/
│   │   ├── client.js
│   │   └── schema.js
│   ├── middleware/
│   │   └── requireAuth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── quiz.js
│   │   ├── progress.js
│   │   └── settings.js
│   └── quiz/
│       ├── modes/            # one file per quiz mode
│       │   ├── index.js      # mode registry
│       │   ├── name.js
│       │   ├── type.js
│       │   └── matchup.js
│       ├── weighting.js      # spaced-repetition selection scoring
│       └── typeEffectiveness.js
├── drizzle/                  # generated migrations
└── public/
    ├── index.html            # shell + import map
    ├── styles.css
    ├── app.js                # root component, screen routing
    ├── api.js                # fetch wrapper (long timeout, 401 handling)
    ├── screens/              # Login, Home, Quiz, Summary, Progress, Settings
    └── components/           # QuestionView, MultipleChoice, TypePicker, TypeBadge, Loader, ...
```

## 5. Data

### 5.1 Pokémon data (`data/pokemon.json`)
Generated once by `scripts/fetch-pokemon.js` from PokéAPI (https://pokeapi.co/api/v2/) and committed. The app never calls PokéAPI at runtime.

Shape:
```json
[
  { "id": 1, "name": "Bulbasaur", "types": ["grass", "poison"], "generation": 1,
    "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png" }
]
```
- **Default:** Gens 1–9 base forms only (no megas/regional forms) for v1. Make the generation range a constant at the top of the script.
- Names display-cased ("Mr. Mime", "Farfetch'd") — use PokéAPI's English species name, not the slug.
- Be polite to PokéAPI: throttle requests, cache responses locally during the script run.
- If a Pokémon has no default front sprite, fall back to its official artwork URL.

### 5.2 Type chart (`data/type-chart.json`)
Hand-written 18×18 matrix of attack-type → defend-type multipliers (0, 0.5, 1, 2). Use the current-generation chart (includes Fairy).

`src/quiz/typeEffectiveness.js` exposes:
- `multiplier(attackType, defenderTypes[])` → product across both defender types (0, 0.25, 0.5, 1, 2, 4)
- Unit tests for a handful of known cases (e.g., Ground vs Flying = 0, Ice vs Grass/Flying = 4, Fire vs Water/Rock... etc.)

## 6. Database schema (Drizzle)

```
users
  id              serial pk
  username        text unique not null
  password_hash   text not null
  settings        jsonb not null default '{}'   -- user preferences, synced across devices
  created_at      timestamptz default now()

progress            -- one row per (user, question key)
  id              serial pk
  user_id         int fk -> users.id on delete cascade
  question_key    text not null      -- e.g. "type:25", "name:6", "matchup:fire>grass/steel"
  mode            text not null      -- any registered mode id, e.g. "name" | "type" | "matchup"
  times_seen      int default 0
  times_correct   int default 0
  streak          int default 0      -- current consecutive-correct count
  last_seen_at    timestamptz
  unique (user_id, question_key)

quiz_sessions       -- optional history, one row per completed round
  id              serial pk
  user_id         int fk -> users.id on delete cascade
  mode            text not null
  total           int not null
  correct         int not null
  started_at      timestamptz not null
  finished_at     timestamptz not null
```

Every progress query must filter by `user_id` from the session, even though there's only one user. That keeps it multi-user-ready.

## 7. Auth (single user, no registration)

**Decision:** users table seeded with one account. There is **no signup route.**

- `scripts/create-user.js <username>`: prompts for password twice (hidden input), hashes with bcrypt, inserts. Refuses if username exists. Run once against Neon **locally** with the production `DATABASE_URL` set (Render's free tier has no shell).
- `POST /api/login` `{ username, password }`
  - Rate-limited: 5 **failed** attempts / 15 min per IP (`skipSuccessfulRequests: true`, so logging in on several devices doesn't lock me out).
  - Constant-ish response time; generic "Invalid credentials" message for both wrong user and wrong password.
  - On success: set `req.session.userId`.
- `POST /api/logout`: clears session.
- `GET /api/me`: returns `{ username }` or 401. Frontend uses this on load to decide login vs quiz screen.
- Cookie: `httpOnly`, `secure` in production, `sameSite: 'lax'`, 14-day max age, fixed from login (not rolling), signed with `SESSION_SECRET`.
- `app.set('trust proxy', 1)` — required on Render so secure cookies and rate-limit IPs work behind its proxy.
- `requireAuth` middleware on all `/api/*` except `/login`, `/me`, and `/healthz`.

## 8. API

All JSON. All require auth unless noted.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | `200 ok` (no auth, no DB hit) |
| POST | `/api/login` | log in (no auth) |
| POST | `/api/logout` | log out |
| GET | `/api/me` | current user or 401 (no auth required) |
| GET | `/api/quiz?mode=<mode>&count=10&gens=1,2` | generate a round of questions |
| POST | `/api/quiz/answer` | `{ questionKey, mode, correct }` → upsert progress |
| POST | `/api/quiz/session` | record a finished round |
| GET | `/api/progress/summary` | per-mode accuracy, weakest items, recent sessions |
| GET | `/api/modes` | list registered modes `{ id, label, answerType }` for the home screen |
| GET | `/api/settings` | current user's settings (merged over defaults) |
| PUT | `/api/settings` | update settings; validate known keys, ignore unknown |

Answer checking can happen client-side (questions include the answer) — it's a personal app, no anti-cheat needed. The server just records results.

## 9. Quiz modes

More modes are expected beyond the initial set, so modes are pluggable.

Each question: `{ questionKey, mode, answerType, prompt, sprite?, choices[], answer }`. Multiple choice, 4 options unless noted.

### Mode registry
- Each mode is one file in `src/quiz/modes/` exporting `{ id, label, answerType, candidates(pool), question(candidate, pool, random) }`:
  - `candidates(pool)` lists every possible question for the selected Pokémon as `{ key, ... }`.
  - `question(candidate, pool, random)` builds one question (prompt, choices, answer).
  - Picking which candidates go into a round lives in one shared place (`src/quiz/generateRound.js`), so the weighting below applies to every mode without each mode reimplementing it.
- `src/quiz/modes/index.js` collects them; `/api/quiz` and `/api/modes` read from the registry. No mode-specific `if/else` in routes.
- `answerType` tells the frontend which input component to render: `"choice"` (pick one → `MultipleChoice`), `"types"` (pick 1–2 types → `TypePicker`). New answer types get a new component; new modes that reuse an existing answer type need **no frontend changes**.
- Adding a mode = one server file (+ a component only if it needs a new answer type).

### Initial modes
1. **Name it** (`name`, `choice`): show sprite → pick the name. Distractors: preferably same-generation Pokémon.
2. **Type it** (`type`, `types`): show sprite + name → select its type(s). Allow 1 or 2 selections from the 18 types; correct only if the set matches exactly.
3. **Matchup** (`matchup`, `choice`): "Fire attack vs Grass/Steel defender — how effective?" → choose 0× / ¼× / ½× / 1× / 2× / 4×. Generate defenders from real Pokémon type combos so they're meaningful. Question keys sort defender types alphabetically (`matchup:fire>grass/steel`) so the same matchup always maps to one key.
4. **Best attack** (`best-attack`, `choice`, v1.1): show a Pokémon → pick the super-effective attack type from 4 options.

### Selection weighting (simple spaced repetition)
When generating a round, weight items so I see weak ones more:
- Never seen → high weight
- Low accuracy or recently missed → high weight
- Long streak + seen recently → low weight

Keep it a simple scoring function in `src/quiz/weighting.js`, shared by all modes; no need for a full SM-2 implementation.

## 10. Frontend

Single page, Preact + htm (see §2), mobile-first. A root `App` component holds the current screen and user/settings state; each screen is a component in `public/screens/`, reusable pieces live in `public/components/`.
- **Login screen:** username, password, submit, error message.
- **Home:** mode picker (from `/api/modes`), generation filter, round length (10/20/30), "Start". Filter and length default to the values in Settings.
- **Settings:** simple form, saved to `PUT /api/settings` so it syncs across devices. Initial settings:
  - default round length (10/20/30)
  - default generations
  - auto-advance after a correct answer (on/off)
  - (easy to add more keys later; defaults live in one place on the server)
- **Question view:** sprite (if any), prompt, big tap-friendly choices, immediate right/wrong feedback (show the correct answer on a miss), "Next".
- **Round summary:** score, missed items list, "Play again".
- **Progress view:** accuracy per mode, top 10 weakest Pokémon/matchups.
- **Wake-up handling:** the first request after idle can take several seconds (Render + Neon both cold-start). Show a "Waking up the server…" loader instead of a blank screen; don't let fetches time out too aggressively (≥30s).
- Type colors as badges (standard type color palette).

## 11. Configuration

`.env.example`:
```
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
SESSION_SECRET=generate-a-long-random-string
NODE_ENV=development
PORT=3000
```
- Use Neon's **pooled** connection string (host contains `-pooler`).
- Optional `DATABASE_URL_UNPOOLED` (Neon's direct connection): if set, `scripts/migrate.js` uses it instead, as Neon recommends for migrations.
- Never commit `.env`.

## 12. Deployment

### GitHub — **Decision**
- Code lives in a **private** GitHub repo; it's both version control and Render's deploy source.
- Local repo is initialized in milestone 1; `main` is the deploy branch (Render auto-deploys on push).
- Never commit `.env` / `.env.*` (except `.env.example`).

### Neon — **Decision: two separate projects**
- `poke-quiz-prod`: used only by Render. Its connection string lives in Render's dashboard (and a local, gitignored `.env.production` for running `create-user.js` once).
- `poke-quiz-dev`: used only by the locally running app (`.env`). Free to wipe and re-migrate.
- Separate projects (not branches) so each gets its own free-tier allowance (100 CU-hours/month, 1 GB storage) and local testing can never exhaust production's compute.

For each project:
1. Create it in a US East region to match Render.
2. Set the compute **max size to 0.25 CU** (the free tier autoscales up to 2 CU, which burns CU-hours 8× faster; 0.25 CU ≈ 400 active hours/month).
3. Copy the pooled connection string (and optionally the direct one for `DATABASE_URL_UNPOOLED`).
4. Run `npm run db:migrate` against it (Render's build does this for prod automatically).

### Render
`render.yaml` (Blueprint):
- Free web service, Node runtime, region matching Neon (e.g. Ohio or Virginia)
- Build: `npm ci && npm run db:migrate`
- Start: `npm start`
- Health check path: `/healthz`
- Env vars: `DATABASE_URL` (sync: false — set in dashboard), `SESSION_SECRET` (generateValue: true), `NODE_ENV=production`

Run migrations in the build command (pre-deploy commands aren't available on the free tier). `npm run db:migrate` runs `scripts/migrate.js`, which only needs `drizzle-orm` + `pg` (regular dependencies). It must not depend on `drizzle-kit`: with `NODE_ENV=production`, `npm ci` skips devDependencies.

After first deploy: run `node --env-file=.env.production scripts/create-user.js teddy` once **locally** with the production `DATABASE_URL` (no shell on Render's free tier).

### Free-tier realities (don't "fix" these with paid features)
- Render free service sleeps after ~15 min idle; first request is slow.
- Neon free compute scales to zero; also contributes to first-request delay.
- 750 Render free hours/month is enough for one always-on service.

## 13. Scripts (`package.json`)

```
"dev":          "node --watch --env-file=.env src/server.js",
"start":        "node src/server.js",
"db:generate":  "drizzle-kit generate",
"db:migrate":   "node scripts/migrate.js",
"fetch:pokemon":"node scripts/fetch-pokemon.js",
"create-user":  "node --env-file=.env scripts/create-user.js",
"test":         "node --test"
```

## 14. Build order (milestones)

Work through these in order; stop after each and summarize what was done.

1. **Scaffold:** `git init` + `.gitignore`, connect the private GitHub repo as `origin` and push, package.json, Express server, `/healthz`, static `public/` with Preact + htm wired up via `/vendor/*` and the import map (a "hello" component renders), `.env.example`, README.
2. **Data:** `fetch-pokemon.js` → generate and commit `data/pokemon.json`; hand-write `type-chart.json`; `typeEffectiveness.js` + tests.
3. **DB:** Drizzle schema (incl. `users.settings`), config, first migration, `scripts/migrate.js`, DB client.
4. **Auth:** `create-user.js`, login/logout/me routes, session cookie, `requireAuth`, rate limiting.
5. **Quiz API:** mode registry + `name`, `type`, `matchup` modes; `/api/modes`, `/api/quiz`, `/api/quiz/answer`, `/api/quiz/session`.
6. **Frontend:** login → home → quiz → summary, `MultipleChoice` + `TypePicker` components, wake-up loader.
7. **Progress & settings:** weighting, `/api/progress/summary`, progress view; `/api/settings` + settings screen.
   - **Local testing checkpoint:** stop here. I play-test the full MVP locally (all screens and modes, progress, settings) against `poke-quiz-dev`, and we fix what I find before deploying.
8. **Deploy:** `render.yaml`, deploy notes in README, verify end to end on phone + laptop.
9. **(v1.1)** `best-attack` mode, then further modes via the registry.

## 15. Done when

- I can log in on my laptop, play a round, then log in on my phone and see the same progress.
- Settings changed on one device show up on the other.
- No route lets anyone create an account.
- Unauthenticated `/api/*` calls (other than login/me/healthz) return 401.
- `npm test` passes, including type-effectiveness cases.
- Deploys to Render from the Blueprint with only `DATABASE_URL` set manually.

## 16. Working agreements for Claude Code

- Ask before adding dependencies not listed in §2.
- Keep code simple and readable over clever; this is a hobby project I'll maintain myself.
- Don't store secrets in code or commit `.env`.
- Commit after each milestone with a clear message.
- If something in this plan is wrong or a better option exists, say so before building it.
