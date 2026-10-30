# Poké Quiz

A personal web app for quizzing myself on Pokémon names, types, and type matchups. Progress syncs across devices.

- **Server:** Node.js + Express 5
- **Frontend:** Preact + htm, served as plain ES modules (no build step)
- **Database:** Postgres on Neon (Drizzle ORM)
- **Hosting:** Render free web service

Design docs live in [`_design_docs/`](_design_docs/): the [plan and milestones](_design_docs/pokemon-quiz-plan.md), the [quiz modes](_design_docs/modes-v1.md), and the [spaced-repetition spec](_design_docs/pokemon-quiz-srs-spec.md).

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
| `npm run fetch:pokemon` | Rebuild `data/pokemon.json` from PokéAPI (one-off; responses cached in `.cache/`) |
| `npm run rebuild:snapshots` | Rebuild `daily_tier_snapshot` (the Collection growth chart) from `review_log` + `card_events`, for repair or backfill |
| `npm run build:palettes` | Rebuild `data/pokemon-palettes.json` (theme colors) from the sprites (one-off; sprites cached in `.cache/sprites/`) |
| `npm run db:generate` | Generate a SQL migration in `drizzle/` from `src/db/schema.js` (no DB needed) |
| `npm run db:migrate` | Apply pending migrations (uses `DATABASE_URL_UNPOOLED` if set, else `DATABASE_URL`), then sync the SRS card catalog |
| `npm run create-user <name>` | Create a login in the dev database (prompts for the password, hidden) |

## Accounts

There is no signup route. Logins are created only with `scripts/create-user.js`:

```sh
npm run create-user teddy                                          # dev (.env)
node --env-file=.env.production scripts/create-user.js teddy        # production
```

Usernames are case-insensitive. A login lasts 14 days from when you log in (not extended by visits), then you log in again. Login is limited to 5 failed attempts per 15 minutes per IP; once limited, even a correct password is refused until the window passes (restarting the server also clears it).

## Quiz modes

11 modes (see [`_design_docs/modes-v1.md`](_design_docs/modes-v1.md) and the table in the plan): Name (free text / multiple choice), Type, Effectiveness (single / dual), Counters (single / dual), Pokémon → Pokédex #, Pokédex # → Pokémon, Pokémon → Region, Region → Pokémon.

Modes are pluggable. Each is one file in `src/quiz/modes/` exporting:

```js
{ id, label, group, answerType, candidates(pool), question(candidate, pool, random), describe(key) }
```

- `candidates(pool)` lists every possible question (`{ key, ... }`) for the selected Pokémon.
- `question(...)` builds one: `{ prompt, sprite, choices, answer, ... }`.
- `describe(key)` turns a saved question key back into something the progress view can show.
- `group` is the heading it's listed under on Home.
- `answerType` picks the frontend input: `choice` (pick one), `types` (pick types; `question.maxSelected`, default 2), `text` (type a Pokémon name), or `number` (Pokédex number).
- Question keys are permanent card IDs for the planned spaced repetition: don't change a mode's key format once it has history.

Typed names are matched by `shared/nameMatch.js`, which the server and the browser both import (served at `/shared/`): case, accents, spaces and punctuation are ignored; a close typo asks to double-check spelling, up to 3 times; another Pokémon's name is always wrong.

To add a mode, create the file and list it in `src/quiz/modes/index.js`. Its questions become spaced-repetition cards on the next `npm run db:migrate` (the catalog sync).

## Playing

- **Play** (Home) runs a spaced-repetition session: the server picks every card (due learning steps, due reviews and bank check-ins, then new cards up to 20 a day, then "working ahead"). Wrong answers are saved as Again right away; a right answer is rated Hard / Good / Easy (keys 2 / 3 / 4, Enter = Good), each button showing when the card comes back. Missed cards get one wrap-up showing before a session ends; End session (Esc) offers "Review N missed cards" or "End now".
- Cards reach **Mastered** through **Practice the bank**: a banked card needs 3 correct days, a week or more apart, and normal Play only checks banked cards in when recall drops below 80% (months apart). Home nudges when banked cards can count today, and bank practice shows those first.
- The session length (10/25/50 questions, 5/10/20 minutes, Endless) is remembered; the "25 questions ▾" control under Play changes it.
- **Free Play** (Home) quizzes on any modes and generations you pick, shuffled with no repeats until the filter is used up. One tap per right answer, no ratings. It never changes scheduling: answers only go to `review_log` (mode `free_play`, before = after values). Its filters and length are remembered separately from Play's.
- **Cards** (header) lists cards by tier (Rotation, Bank, Mastered, Trouble, All) with search, mode / generation filters and sorting by recall chance. Each card opens a detail sheet (recall now, stability, next review, bank count) with its actions: Restore to rotation, Demote to bank, Move to bank, Mark as mastered. Bulk actions apply one of those to the whole filtered list or N random cards. The Bank and Mastered tabs start practice sessions. A never-answered card moved to the bank or mastered by hand starts with 30-day stability, so its first check-in is about 100 days out.
- **Settings → What to learn** picks which modes and generations new cards come from. Cards already started keep coming back for review.
- **Progress**: headline numbers (mastered +N this week, daily streak, recall rate this week), Collection growth (cards per tier per day; 1 month / 3 months / 1 year / All), True recall rate per week (real tests of memory only, 90% target line, low-data weeks faded), bars by mode and by generation (tap to open those cards), a year-long activity calendar with the current streak outlined, a Free Play panel, and recent sessions. Charts are plain SVG (`public/components/charts.js`) with hover/keyboard tooltips and a "Show as table" view. Tier colors are one blue ramp, validated for color blindness and contrast in both modes.
- **Theme:** Settings → Theme takes a Pokédex number and colors the app after that Pokémon. `public/themeColors.js` turns its palette into the CSS tokens (`--accent` fill, `--accent-ink` for text/borders, `--accent-soft`, `--bg`), adjusting lightness so every theme stays readable in light and dark mode (a test checks all 1,025). Right/wrong colors and type badges never change. The computed theme is cached in the device's localStorage so `index.html` applies it before the first paint.
- Settings (theme, What to learn, last session length) are stored on the server, so they sync across devices. Defaults and validation live in `src/routes/settings.js`.
- **Reset all progress** (bottom of Settings, after a confirmation) deletes every per-user progress/history table in one transaction, keeping the login and settings. The list of tables is `USER_DATA_TABLES` in `src/db/userData.js`; a test fails if a table with a `user_id` column is missing from it, so new tables can't be forgotten.

## Spaced repetition

Built in phases from [`_design_docs/pokemon-quiz-srs-spec.md`](_design_docs/pokemon-quiz-srs-spec.md). All phases are built: Play (S5), Free Play (S6), the Cards screens (S7) and the Progress screen (S8).

- `src/srs/config.js`: every SRS setting in one object (retention, learning steps, new cards per day, bank and mastery rules, …).
- **Tables** (migrations `0001_srs_tables`, `0002_retire_pre_srs_tables`, `0003_free_play_filter`): `cards` (shared catalog, one row per mode question), `card_state`, `sessions`, `review_log`, `card_events`, `daily_tier_snapshot`. `npm run db:migrate` also syncs `cards` with the mode registry (`src/srs/catalog.js`, `src/db/cards.js`). `review_log` + `card_events` replay to the exact `card_state` (`src/srs/replay.js`).
- **API** (`src/routes/play.js`, `src/db/srs.js`): start a Play / practice session, get the next card (with the Hard/Good/Easy due-date previews), answer (card state + review log in one transaction; the next card comes back in the same response), undo "Banked!"/"Mastered!", end with a summary, "Add 10 more" new cards.
- `src/srs/tiers.js`, `review.js`, `queue.js`, `session.js`, `days.js`: the spec's tier, queue and session rules as pure functions (no database yet). The plan doc lists the interpretation choices made where the spec left room.
- `src/srs/scheduler.js`: a pure wrapper around [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) 5.4.2 (FSRS-6): `answer(card, rating, now)`, `preview(card, now)`, `retrievability(card, now)`. The rest of the app uses its card shape, never ts-fsrs types. Fuzz is seeded from the review time and card state, so replaying a card's history reproduces its due dates.

## Database

Two separate Neon projects, so local testing can't touch real data or use up production's free compute:

- `poke-quiz-dev`: local development, connection strings in `.env`
- `poke-quiz-prod`: Render only

Both are capped at 0.25 CU compute. `.env` needs the **pooled** string (`-pooler` host) as `DATABASE_URL` and, ideally, the **direct** string as `DATABASE_URL_UNPOOLED` for migrations. Note that Neon's own env-file download names these the other way around.

Schema changes: edit `src/db/schema.js`, run `npm run db:generate`, review and commit the new file in `drizzle/`, then `npm run db:migrate`. Render applies pending migrations automatically on deploy.

## Data

- `data/pokemon.json`: generated by `scripts/fetch-pokemon.js` and committed. The generation range is set at the top of the script.
- `data/pokemon-palettes.json`: each Pokémon's 1–3 main colors (accent first), generated by `scripts/build-palettes.js` from the sprites and committed. Shades of one color are grouped; the accent is the biggest colorful group.
- `data/type-chart.json`: hand-written Gen 6+ type chart (rows attack, columns defend). Tests check every immunity and the total count of each multiplier.

## How the frontend loads without a build step

Express serves the `preact` and `htm` packages from `node_modules` under `/vendor/*`. An import map in `public/index.html` lets frontend code use normal imports (`import { html } from 'htm/preact'`). To upgrade either library, bump its version in `package.json` and run `npm install`.

## Deployment

Deploy notes (Render + two Neon projects: `poke-quiz-prod` and `poke-quiz-dev`) will be added in milestone 8.
