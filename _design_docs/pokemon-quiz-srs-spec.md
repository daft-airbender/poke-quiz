# Spec: Spaced Repetition for the Pokémon Quiz App (FSRS)

## Context

This is a personal web app I use to quiz myself on Pokémon names, types, and type matchups. It runs on Render with a Neon (Postgres) database and has a single login (me) so my progress syncs across devices.

**How I play:** I binge. I want to play long sessions, and as many sessions as I like, without the app running out of things to do. **Every answer must count toward tracking what I've learned**, but repeat answers in a short window shouldn't let a card look "memorized" when it isn't.

**Approach:** Use **FSRS**, the scheduler behind Anki's modern optional mode. FSRS models memory over real time and can learn from an answer given at *any* moment, whether the card is due, early, or late. Each answer is weighted by how likely I was to remember the card at that moment:

- **Wrong at any time** → counts in full: stability drops and the card comes back soon.
- **Right after a long gap** → counts a lot: stability rises sharply.
- **Right again minutes or hours after the last answer** → counts a little: it's recorded but gives a small gain.

Put all scheduling behind a small **pure module** (no DB or UI code in it) and unit-test it.

---

## Library

Use the maintained **`ts-fsrs`** npm package. Don't hand-roll the math.

- Check the current `ts-fsrs` README/API before writing code. Function and field names below are a guide and may differ by version.
- Enable **short-term (same-day) scheduling** so minute-level learning steps and same-day repeats are modeled properly.
- Enable **fuzz** so cards learned together don't all come due on the same day. Make the randomness injectable or seedable for tests.
- Wrap the library in my own `Scheduler` interface (below) so the rest of the app doesn't depend on it directly.

---

## Core concepts

- **Card**: One quizzable fact. Each card has its own memory state. Examples:
  - "What Pokémon is #025?" → Pikachu
  - "What type(s) is Gyarados?" → Water / Flying
  - "Fire attacking Grass: effectiveness?" → 2×
- **Memory state (from FSRS), per card:**
  - **Stability (S)**: Days until the chance of recall drops to 90%. Higher means the card is more solidly learned.
  - **Difficulty (D)**: 1–10, how hard the card is *for me*. It drifts back toward average over time, so one bad day doesn't punish a card forever.
  - **Retrievability (R)**: My current chance of recalling the card, 0–1. It's calculated from S and the time since the last review, not stored.
- **Card states:** `new`, `learning`, `review`, `relearning` (from FSRS), plus my own **tier** on top: `rotation` → `bank` → `mastered` (see "Bank and Mastered").
- **Rating:** `again` (1), `hard` (2), `good` (3), `easy` (4). This is how hard the answer was to *recall this time*, not how hard the question is in general.

### Mapping quiz answers to ratings

- **Wrong answer** → `again`, automatically.
- **Correct answer** → show `Hard` / `Good` / `Easy` buttons. Keyboard shortcuts 2/3/4; Enter or a tap means Good, the default.
  - Hard = correct but a struggle or a near-guess. Good = normal recall. Easy = instant.
- Each button shows when the card will next be due, like Anki does ("10m / 2d / 6d").
- Record how long I took to answer (`answer_ms`). Don't use it for grading in v1.

---

## Configuration (one config object)

| Setting | Default | Notes |
|---|---|---|
| Desired retention | 0.90 | FSRS schedules a review when R is expected to hit this |
| Maximum interval | 36500 days | |
| Short-term scheduling | enabled | |
| Learning steps | 1 min, 10 min | if the library version supports configuring them |
| Relearning steps | 10 min | same |
| Fuzz | enabled | |
| FSRS parameters (weights) | library defaults | replace later with weights fit to my history |
| New cards per day (soft limit) | 20 | "Add 10 more" button lets me go past it |
| Repeat cooldown | 8 cards **or** 3 min | don't show the same card again sooner, unless it's a due learning step |
| Leech threshold | 8 lapses | |
| Session length options | 10 / 25 / 50 questions; 5 / 10 / 20 min; Endless | |
| Session length default | last choice used | first-ever default: 25 questions |
| Bank: minimum stability to enter | 30 days | |
| Auto-bank | enabled | |
| Bank check-in threshold | R < 0.80 | banked card comes back for a check-in |
| Mastery: required bank correct days | 3 | net count; see "Bank correct-day counter" |
| Mastery: minimum gap between counted days | 7 days | also the minimum wait after entering the bank |

---

## Every answer counts

- Every answer in a normal **Play** session goes through the scheduler and updates the card's FSRS state. That includes due reviews, early reviews, new cards, check-ins, and practice on banked or mastered cards.
- The one exception is **Free Play** (see below): it's logged and tracked, but never changes scheduling or tiers.
- Pass the actual current time to the scheduler. FSRS uses the real time since the last review to work out R, which is what weights each answer.
- Every answer, Free Play included, is written to `review_log` (see Data model). That log is the source of truth for stats and for fitting my own FSRS weights later.

---

## Session queue (always has something to play)

A session runs until its length limit is reached (see "Session length") or I quit. Pick the next card using these tiers in order, skipping any card still in its cooldown:

1. **Due learning/relearning cards**: their minute-level step has passed.
2. **Due review cards and bank check-ins**: rotation cards due now or overdue, plus banked cards whose R has dropped below the check-in threshold. Pick the lowest current R first, i.e. the cards I'm most likely forgetting.
3. **New cards**: up to the daily soft limit, counting new cards introduced today in America/New_York time.
4. **Keep playing**: all remaining rotation cards that have been studied at least once, lowest current R first. That puts weak and soon-due cards first; the strongest cards naturally come last.
5. If tier 4 is empty (everything is banked, mastered, or in cooldown): offer "Add more new cards" or "Practice the bank".

Notes:

- Re-pick after every answer, because each answer changes the order.
- The cooldown stops back-to-back repeats of the same card during a binge.
- Show a small "due / ahead" indicator so I know whether I'm doing scheduled reviews or working ahead.
- Warn gently when I go past the new-card limit, because new cards today mean more reviews in the coming weeks.

---

## Session length

When I tap **Play**, I can pick how long the session lasts:

- **Question count:** 10, 25, or 50 questions
- **Timer:** 5, 10, or 20 minutes
- **Endless:** until I quit

Rules:

- **Remember my last choice.** Play starts right away with it, and a small control on the Play screen changes it (e.g. "Play · 25 questions ▾").
- **Session length never affects scheduling.** Every answer counts the same under the FSRS and tier rules whatever length I picked.
- **Question count**: each question answered counts toward the limit, repeats included.
- **Timer**: when time runs out, finish the current question instead of cutting it off.
- **Wrap-up for misses**: when the limit is reached (count or timer), any card I missed during the session and haven't since answered correctly comes back **once more** before the session ends, so I don't finish on a miss. These wrap-up questions go past the limit, and the screen labels them "Wrap-up".
  - Cooldown still applies. If the card was just shown, put another wrap-up card first, or wait briefly if there's no other.
  - Each card gets at most one wrap-up showing. If I miss it again, it stays in its normal relearning schedule for next time.
- **End session button**: always visible during play in every mode, and the only way out of Endless. Keyboard shortcut: Esc.
  - If there are missed cards waiting for wrap-up, ask: **"Review N missed cards"** (does the wrap-up, then shows the summary) or **"End now"** (goes straight to the summary).
  - If there aren't, end right away and show the summary.
  - Leaving mid-question (closing the tab, losing connection) is fine. Every answer already given is saved, and the unanswered question just doesn't count.
- In Endless mode, show a running count ("37 answered · 89%") where a count or timer session would show its progress.

### End-of-session summary

Shown when a session ends:

- Questions answered and % correct
- Number of new cards learned
- Cards that moved tiers this session: **Banked**, **Mastered**, and **Back to rotation** (misses on banked/mastered cards), each listed by name
- Cards missed this session, so I can see what's shaky
- Buttons: **Keep going** (starts another session with the same length) and **Done**

---

## Free Play

A separate mode, started from its own **Free Play** button next to Play. It's a **self-contained sandbox** for quizzing myself on anything I choose. It has no connection to learning progress: no tiers, no banking or mastery, no scheduling.

### Choosing what to play

- Filters: card type (names / types / matchups) and generation. Default is everything. Free Play doesn't show or use tiers at all; every card is equally available.
- Order: shuffled. Avoid repeats until every card in the filter has been shown once, then reshuffle.
- Session length: the same options as Play (10 / 25 / 50 questions, 5 / 10 / 20 min, Endless), with its own remembered last choice. The End session button and the miss wrap-up work the same way.

### What Free Play does and doesn't affect

- **No effect on scheduling:** FSRS state (stability, difficulty, due date), tiers, the bank correct-day counter, the daily new-card count, and leech status are all unchanged.
- A card never answered in Play stays unseen as far as Play is concerned; Free Play doesn't introduce it into rotation.
- No tier labels, badges, or prompts appear anywhere in Free Play.
- **Correct answers only need one tap.** There's no Hard / Good / Easy step, since ratings don't affect anything here. Right or wrong is recorded.
- **Always logged:** every answer goes into `review_log` with `mode = 'free_play'`, for Free Play's own progress charts. The FSRS and tier "before" and "after" values are equal, so they're easy to check.

### Free Play summary

Shown at the end of every Free Play session: questions answered, % correct, accuracy by category for the session, and the cards I missed, with **Keep going** and **Done**. There's no tier or new-card information.

---

## Bank and Mastered

On top of the FSRS state, every card has a **tier**:

- **Rotation**: the normal pool. Cards are scheduled by FSRS and show up in sessions.
- **Bank**: probably memorized. Out of normal rotation, but comes back for occasional **check-ins**.
- **Mastered**: proven memorized. Never shown unless I bring it back.

```
Rotation --(stability >= 30 days)--> Bank --(3 counted correct days, 7+ days apart)--> Mastered
    ^                                  |                                                  |
    +------------- any miss -----------+-------------------- any miss --------------------+
```

### Rotation → Bank

After an answer, move the card to the bank (tier = `bank`, set `banked_at`) when **all** of these hold:

- Its FSRS state after the answer is `review`.
- The answer wasn't `again`.
- Stability ≥ 30 days. In plain terms: FSRS predicts I'd still have about a 90% chance of recalling it 1 month from now. (The bank check-ins catch it if that prediction is wrong.)

There's no day-count requirement in rotation; the stability bar is enough.

Show a small "Banked!" message with a one-tap **Undo**.

### While banked: check-ins

- Banked cards don't appear in normal rotation tiers.
- **Check-in**: when a banked card's predicted recall (R) drops below **0.80**, it enters the session queue along with due reviews (tier 2). This is how a wrong prediction gets caught.
- I can also **practice the bank** on purpose (a session of banked cards only, lowest R first).
- Every answer to a banked card updates its FSRS state like any other answer. A correct check-in boosts stability a lot, so the next check-in is pushed much further out.

### Bank correct-day counter

Each banked card keeps a **net count of counted correct days**. Only answers given while the card is in the bank count toward it.

- **Counting a day (+1)**: a correct answer to a banked card counts only if it's at least **7 days** after the last counted day. For the first counted day, it must be at least 7 days after the card entered the bank (`banked_at`) instead. Correct answers sooner than that update FSRS but don't change the counter. Several correct answers in one day count as one.
- **Miss (−1)**: a wrong answer to a banked card subtracts 1 (never below 0) and **sends the card back to rotation**.
  - A miss decides the day: if a day was counted earlier that same day, take that +1 back as well (net −1 for the day), and restore the previous last-counted date.
  - The counter is **kept** in rotation, not reset. When the card is banked again, it continues from where it left off. The 7-day wait starts over from the new `banked_at`.
- **Bank → Mastered**: when the counter reaches **3**, the card moves to `mastered` (set `mastered_at`). Show a "Mastered!" message with Undo.

Example: banked on Day 0. Correct on Day 3 → doesn't count (too soon after banking). Correct on Day 8 → 1. Correct on Day 10 → doesn't count (under 7 days since Day 8). Correct on Day 16 → 2. Correct on Day 23 → 3 → **Mastered**.

Miss example: counter at 2, then a miss on a check-in → counter 1, card goes to rotation. Later it's banked again; it needs 2 more counted days (with the 7-day wait from the new banking date).

Fastest possible path: Mastered **3 weeks after entering the bank**.

### Mastered

- Mastered cards are never shown in sessions, check-ins included.
- Their FSRS state is kept and R keeps decaying in the background. The UI can show it, but nothing acts on it automatically.
- If I practice a mastered card on purpose and miss it, it goes back to **rotation** and the counter takes −1, same as a banked miss.

### Screens and actions

- **Bank** and **Mastered** screens list their cards. Searchable, filterable by card type, sortable by current R so I can see which ones are fading.
- **Restore** (from either screen): move the card back to rotation, due = now. Keep its FSRS state and counter.
- **Demote Mastered → Bank**: put it back on check-ins without sending it all the way to rotation.
- **Bulk actions**: e.g. all cards of one type, a whole generation, or N random cards.
- **Practice the bank / Practice mastered**: sessions drawn only from that tier, lowest R first. Answers count normally under the rules above.
- **Manual shortcuts**: "Move to bank" and "Mark as mastered" buttons on any card, for things I already know cold. They skip the automatic rules.

---

## Progress screen

A single **Progress** screen, reachable from the main menu. All of it is calculated from `review_log`, `card_state`, and `cards`; nothing new needs to be tracked during play. Days are America/New_York calendar days throughout.

Give each tier one color and use it everywhere (charts, badges, the Bank/Mastered screens): **Unseen**, **Rotation**, **Bank**, **Mastered**. Make sure the colors work in light and dark mode and can be told apart by people with color blindness.

### Headline numbers (top of screen)

- **Mastered**: total mastered cards, plus "+N this week"
- **Streak**: consecutive days with at least one answer (Play or Free Play). Today counts if I've played; if I haven't played yet today, the streak from yesterday still shows.
- **Recall rate this week**: see chart 2 for how it's defined

### Chart 1: Collection growth (the headline chart)

- A stacked area chart over time: number of cards in each tier per day (Unseen / Rotation / Bank / Mastered). The total equals all cards.
- Unseen = cards never answered. Rotation includes cards in learning/relearning.
- Range picker: 1 month / 3 months / 1 year / All. Group by week for ranges over 3 months.
- Tooltip: the date and the count in each tier.
- Data: a `daily_tier_snapshot` table (below), written once per day: when the first answer of a new day comes in, record the previous day's counts. It must also be rebuildable from `review_log` (replaying `tier_before`/`tier_after`), so history can be backfilled or repaired.

### Chart 2: True recall rate

- A weekly line chart: % of answers that were correct (Hard/Good/Easy) among **real tests of memory** only:
  - include `mode` in (`due`, `bank_checkin`), and
  - only answers given at least 1 day after that card's previous answer, and
  - exclude wrap-up answers, new cards, practice sessions, and same-day repeats.
- A dashed reference line at the desired retention (90%).
- Hide weeks with fewer than 10 qualifying answers, or show them faded and labeled "low data", so one tiny week doesn't produce a misleading spike.
- Tooltip: the week, the %, and "N of M correct".

### Chart 3: Breakdown by category

- Two sets of horizontal progress bars:
  - **By card type**: names, types, matchups (and any added later)
  - **By generation**: Gen 1, Gen 2, ...
- Each bar is stacked by tier using the same four colors, labeled "% banked or mastered".
- Tapping a bar opens that category's cards, filtered and sorted by tier.
- Requires each card's `payload` (or a column) to include its generation. Cards with no generation (e.g. pure type-matchup cards) appear only in the card-type breakdown.

### Free Play panel

Free Play gets its own section on the Progress screen, kept separate from the learning charts:

- **Headline**: Free Play questions answered and accuracy, this week and all time.
- **Accuracy over time**: a weekly line chart of Free Play % correct. Weeks with fewer than 10 answers are faded and labeled "low data".
- **Accuracy by category**: bars by card type and by generation.
- **Most missed in Free Play**: the cards I miss most often here, shown as a plain list with no tier info and no actions.

Free Play answers are **excluded** from the Collection growth and True recall rate charts and from the learning headline numbers. They do count toward the **activity calendar** and the **streak**, since they're still practice.

### Chart 4: Activity calendar

- A GitHub-style heatmap of the last 12 months: one square per day, shaded by number of questions answered (5 shades: none, then 4 levels based on my own range of activity).
- Shading counts all answers, Play and Free Play.
- Tooltip: the date, questions answered (split into Play and Free Play), and % correct that day.
- The current streak's days are highlighted.

### General

- Show a friendly empty state on each chart until there's enough data (e.g. "Play a few days to see your recall rate").
- Charts should be readable on a phone screen.

---

## Leeches

When a card reaches 8 lapses (times I got it wrong after it was learned), flag it `is_leech` and show it on a "Trouble cards" list. Don't suspend it automatically. Leeches usually mean the card itself needs rewording or a hint.

---

## Data model (Postgres / Neon)

```sql
-- One row per quizzable fact
cards (
  id              serial primary key,
  card_type       text not null,        -- 'dex_to_name' | 'pokemon_types' | 'type_matchup' | ...
  prompt_key      text not null unique, -- stable key, e.g. 'type_matchup:fire>grass'
  payload         jsonb not null,       -- data needed to render the question/answer
  created_at      timestamptz default now()
)

-- Current memory state (single user → one row per card)
card_state (
  card_id         int primary key references cards(id),
  fsrs_state      text not null default 'new',   -- new | learning | review | relearning
  tier            text not null default 'rotation', -- rotation | bank | mastered
  banked_at       timestamptz,                  -- when it last entered the bank
  mastered_at     timestamptz,
  due_at          timestamptz,
  stability       double precision,
  difficulty      double precision,
  reps            int not null default 0,
  lapses          int not null default 0,
  learning_step   int not null default 0,
  last_review_at  timestamptz,
  is_leech        boolean not null default false,
  bank_correct_days  int not null default 0,    -- net counted correct days (kept across trips to rotation)
  bank_last_counted  date,                      -- last day that counted (+1)
  bank_prev_counted  date,                      -- the one before, for undoing a same-day +1 on a miss
  updated_at      timestamptz default now()
)
-- Keep the FSRS state separate from tier so moving between tiers never touches the memory model.

-- One row per play session (for the summary and stats)
sessions (
  id              uuid primary key,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  length_type     text not null,               -- 'count' | 'timer' | 'endless'
  length_value    int,                         -- questions or minutes; null for endless
  ended_reason    text                         -- 'limit' | 'quit'
)

-- Settings (single user): includes last-used session length
settings (
  key             text primary key,
  value           jsonb not null
)

-- One row per day: card counts per tier, for the Collection growth chart
daily_tier_snapshot (
  day             date primary key,             -- America/New_York
  unseen          int not null,
  rotation        int not null,
  bank            int not null,
  mastered        int not null
)

-- Append-only log of every answer
review_log (
  id               bigserial primary key,
  card_id          int references cards(id),
  session_id       uuid references sessions(id),
  reviewed_at      timestamptz not null default now(),
  rating           smallint not null,          -- 1..4 (Free Play: 1 = wrong, 3 = right)
  mode             text not null,              -- 'due' | 'ahead' | 'new' | 'bank_checkin' | 'bank_practice' | 'mastered_practice' | 'free_play'
  fsrs_state_before text not null,
  stability_before double precision,
  stability_after  double precision,
  difficulty_before double precision,
  difficulty_after double precision,
  retrievability_at_review double precision,   -- R just before answering
  due_before       timestamptz,
  due_after        timestamptz,
  tier_before      text not null,
  tier_after       text not null,
  bank_counter_after int,
  is_wrapup        boolean not null default false,
  answer_ms        int
)
```

- Write the `card_state` update and the `review_log` insert in **one transaction**.
- Store enough in `review_log` to rebuild any card's state by replaying its history.

---

## Scheduler interface

```ts
type Rating = 1 | 2 | 3 | 4; // again, hard, good, easy

interface Scheduler {
  // Pure: returns the new memory state; never touches the DB
  answer(card: CardMemory, rating: Rating, now: Date): CardMemory;

  // Due date for each button, for the labels ("10m / 2d / 6d")
  preview(card: CardMemory, now: Date): Record<Rating, Date>;

  // Current chance of recall, 0..1
  retrievability(card: CardMemory, now: Date): number;
}

// Separate pure helpers (not part of FSRS):
// Applies tier rules after the FSRS update: banking, counter changes, mastery, misses back to rotation
applyTierRules(card: CardWithTier, rating: Rating, now: Date, config): CardWithTier;
pickNextCard(candidates, now, config, sessionRecent): Card | null;
```

---

## Tests to write

**Scheduler (through the wrapper)**
- A new card rated Good moves through the learning steps and then becomes `review`.
- Again on a review card lowers stability, adds 1 to lapses, and makes it due within minutes.
- Answering Good right after a previous Good, minutes or hours later, raises stability **much less** than Good after a long gap. This is the core binge-proof property.
- Retrievability decreases as time passes since the last review.
- With a seeded random source, fuzz is deterministic.

**Tiers**
- Rotation → Bank only when stability ≥ 30 days, state is `review`, and the answer wasn't Again. Many correct answers on the same day don't get there.
- Banked cards don't appear in rotation tiers, but do appear as check-ins once R < 0.80.
- A correct banked answer less than 7 days after `banked_at` doesn't count.
- A correct banked answer less than 7 days after the last counted day doesn't count; several in one day count once.
- Example: banked Day 0; correct Days 3, 8, 10, 16, 23 → counter 0, 1, 1, 2, 3 → Mastered on Day 23.
- A miss while banked: counter −1 (floor 0), back to rotation, counter kept. A same-day earlier +1 is undone too.
- Re-banked card continues its counter, and the 7-day wait restarts from the new `banked_at`.
- Mastered cards never appear in any session queue, check-ins included.
- A miss on a mastered card (practice) → rotation, counter −1.
- Undo restores the exact previous tier and counter.
- Replaying `review_log` reproduces the tier and counter of every card.

**Queue**
- Tier order is respected; within a tier, lowest R comes first.
- The cooldown prevents back-to-back repeats except for due learning steps.
- The new-card soft limit counts by the America/New_York calendar day, and "add more" goes past it.
- The queue never returns empty while studied rotation cards exist.

**Session length**
- A 10-question session ends after 10 answers plus any wrap-up questions.
- A card missed during the session and not since answered correctly gets exactly one wrap-up showing; one that was later answered correctly gets none.
- A timer session finishes the current question when time runs out, then does wrap-up.
- Wrap-up answers update FSRS and tiers like any other answer.
- The last-used length is remembered and becomes the default next time.
- The summary's lists of banked / mastered / back-to-rotation cards match the `review_log` rows for that session.

**Progress screen**
- Tier counts per day add up to the total number of cards.
- Rebuilding `daily_tier_snapshot` from `review_log` matches the stored rows.
- Recall rate excludes new cards, wrap-ups, practice sessions, and answers given less than 1 day after the card's previous answer.
- Weeks with fewer than 10 qualifying answers are flagged as low data.
- Streak: consecutive days with at least 1 answer; still shows yesterday's streak if I haven't played today; resets after a day with no play.
- Category bars group correctly by card type and by generation; cards with no generation appear only under card type.

**Free Play**
- A Free Play answer never changes FSRS state, tier, bank counter, new-card count, or leech status.
- An Unseen card answered in Free Play stays Unseen.
- Filters work; there are no repeats until the filtered set is used up.
- No tier filters, labels, or prompts appear in Free Play.
- Free Play answers are excluded from Collection growth and True recall rate, but included in the activity calendar and streak.
- Free Play answers appear in `review_log` with `mode = 'free_play'`.

**Data**
- Every answer writes exactly one `review_log` row in the same transaction as the state update.
- Replaying a card's `review_log` gives back its current `card_state`.

---

## Later (not v1)

- **Personal FSRS weights**: once I have enough reviews (roughly 1,000+), fit FSRS parameters to my `review_log` with an FSRS optimizer and load them into the config.
- **Grading by answer time**: use `answer_ms` to suggest Hard/Good/Easy automatically.
- **More stats**: e.g. average answer time trends, or a forecast of upcoming reviews and check-ins.
