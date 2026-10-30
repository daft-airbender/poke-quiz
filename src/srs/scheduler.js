// FSRS scheduling behind a small pure interface, so the rest of the app never depends on ts-fsrs directly.
// No database or UI code here: every function takes a card's memory and a time, and returns new values.
//
// CardMemory (our shape; matches the card_state columns in the SRS spec):
//   { state: 'new' | 'learning' | 'review' | 'relearning', due: Date | null, stability: number | null,
//     difficulty: number | null, reps, lapses, learningStep, lastReviewAt: Date | null }
// Rating: 1 again, 2 hard, 3 good, 4 easy.
import { fsrs, generatorParameters, State } from 'ts-fsrs';
import { SRS_CONFIG } from './config.js';

export const RATING = Object.freeze({ again: 1, hard: 2, good: 3, easy: 4 });
const RATINGS = [RATING.again, RATING.hard, RATING.good, RATING.easy];

const STATE_NAMES = { [State.New]: 'new', [State.Learning]: 'learning', [State.Review]: 'review', [State.Relearning]: 'relearning' };
const STATES = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning };

// A card that has never been answered.
export function newCardMemory() {
  return { state: 'new', due: null, stability: null, difficulty: null, reps: 0, lapses: 0, learningStep: 0, lastReviewAt: null };
}

function toLibraryCard(memory, now) {
  return {
    due: memory.due ?? now,
    stability: memory.stability ?? 0,
    difficulty: memory.difficulty ?? 0,
    // Derived from lastReviewAt by the library; kept at 0 because the field is deprecated.
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: memory.learningStep,
    reps: memory.reps,
    lapses: memory.lapses,
    state: STATES[memory.state],
    last_review: memory.lastReviewAt ?? undefined,
  };
}

function fromLibraryCard(card) {
  return {
    state: STATE_NAMES[card.state],
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    learningStep: card.learning_steps,
    lastReviewAt: card.last_review ?? null,
  };
}

function assertRating(rating) {
  if (!RATINGS.includes(rating)) throw new Error(`rating must be 1-4, got ${rating}`);
}

// Builds a Scheduler from config (SRS_CONFIG.fsrs shape).
// options.seed(memory, now) -> string replaces the fuzz seed. By default ts-fsrs seeds fuzz from the
// review time and the card's state, so the same history always gives the same due dates (replayable).
export function createScheduler(config = SRS_CONFIG.fsrs, { seed } = {}) {
  const params = generatorParameters({
    request_retention: config.desiredRetention,
    maximum_interval: config.maximumIntervalDays,
    enable_short_term: config.shortTermScheduling,
    learning_steps: [...config.learningSteps],
    relearning_steps: [...config.relearningSteps],
    enable_fuzz: config.fuzz,
    ...(config.weights ? { w: config.weights } : {}),
  });
  const library = fsrs(params);
  if (seed) {
    library.useStrategy('Seed', function seedStrategy() {
      return seed(fromLibraryCard(this.current), this.review_time);
    });
  }

  return {
    // The card's memory after answering with `rating` at `now`. Pure: `memory` isn't changed.
    // Pass the real time: FSRS weighs each answer by how long it's been since the last one.
    answer(memory, rating, now) {
      assertRating(rating);
      return fromLibraryCard(library.next(toLibraryCard(memory, now), now, rating).card);
    },

    // When the card would next be due for each rating, for the button labels ("10m / 2d / 6d").
    preview(memory, now) {
      const outcomes = library.repeat(toLibraryCard(memory, now), now);
      return Object.fromEntries(RATINGS.map((rating) => [rating, outcomes[rating].card.due]));
    },

    // Current chance of recall, 0..1. A card never answered has nothing to recall yet: 0.
    retrievability(memory, now) {
      if (memory.state === 'new' || !memory.lastReviewAt) return 0;
      return library.get_retrievability(toLibraryCard(memory, now), now, false);
    },
  };
}
