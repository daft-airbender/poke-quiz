// All spaced-repetition settings in one place (see _design_docs/pokemon-quiz-srs-spec.md, "Configuration").
// S1 uses `fsrs`; the rest is read by the tier, queue and session rules in later phases.

export const SRS_CONFIG = Object.freeze({
  // Passed to the FSRS scheduler (src/srs/scheduler.js).
  fsrs: Object.freeze({
    desiredRetention: 0.9, // schedule a review when recall is expected to drop to 90%
    maximumIntervalDays: 36500,
    shortTermScheduling: true, // minute-level learning steps and same-day repeats
    // No minute-level steps (changed from the spec's 1m / 10m after play-testing): a card answered right isn't
    // shown again for days (Hard ~1, Good ~2, Easy ~8), and one answered wrong comes back in a day or two, after
    // its one wrap-up retry at the end of the session. Same-day repeats crowded new cards out of later rounds.
    learningSteps: Object.freeze([]),
    relearningSteps: Object.freeze([]),
    fuzz: true, // spread out cards learned together so they don't all come due the same day
    weights: null, // null = ts-fsrs defaults; later, weights fit to my own review_log
  }),

  // New cards per day (counted per America/New_York day). null = unlimited, the default; each user can pick a
  // limit in Settings from these options. Fewer new cards a day means fewer reviews in the weeks after.
  newCardsPerDay: null,
  newCardsPerDayOptions: Object.freeze([10, 20, 30, 50, 100]),
  addMoreNewCards: 10, // the "Add 10 more" button
  repeatCooldown: Object.freeze({ cards: 8, minutes: 3 }), // don't repeat a card sooner, unless it's a due learning step
  wrapUpWaitSeconds: 5, // a wrap-up card that was just shown, with no other to put first, waits this long
  leechLapses: 8,
  manualKnownDifficulty: 5, // difficulty (1-10) given to a never-answered card moved to the bank or mastered by hand
  timeZone: 'America/New_York',

  sessionLengths: Object.freeze({
    count: Object.freeze([10, 25, 50]), // questions
    timer: Object.freeze([5, 10, 20]), // minutes
  }),
  defaultSessionLength: Object.freeze({ type: 'count', value: 25 }), // until a "last used" exists

  bank: Object.freeze({
    minStabilityDays: 30, // rotation -> bank once stability reaches this
    autoBank: true,
    checkInBelowRetrievability: 0.8, // a banked card comes back for a check-in below this
  }),
  mastery: Object.freeze({
    requiredCorrectDays: 3, // net counted correct days in the bank
    minDaysBetweenCountedDays: 7, // also the minimum wait after entering the bank
  }),
});
