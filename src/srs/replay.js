// Rebuilds a card's current state from its history: review_log rows plus card_events (manual tier actions
// and undos), applied in time order with the same rules used live. Used to check that card_state can always
// be reproduced from the logs, and to repair it if not. Pure.
import { SRS_CONFIG } from './config.js';
import { reviewCard } from './review.js';
import { tierSnapshotFromJson } from './rows.js';
import { newCardMemory } from './scheduler.js';
import { manualTierChange, newTierFields, restoreTier } from './tiers.js';

// reviews: [{ reviewedAt, rating, mode }] (Free Play rows are skipped: they never change scheduling)
// events:  [{ at, action, undoTo }]
// Returns the card, or null if nothing in the history touched it (still unseen).
export function replayCard({ reviews, events }, { scheduler, config = SRS_CONFIG }) {
  const history = [
    ...reviews.filter((r) => r.mode !== 'free_play').map((r) => ({ at: r.reviewedAt, kind: 0, review: r })),
    ...events.map((e) => ({ at: e.at, kind: 1, event: e })),
  ];
  // Time order; on a tie, the answer comes before the action that followed it (e.g. its Undo).
  history.sort((a, b) => a.at - b.at || a.kind - b.kind);

  let card = null;
  for (const item of history) {
    card ??= { ...newTierFields(), memory: newCardMemory() };
    if (item.review) {
      card = reviewCard(card, item.review.rating, item.review.reviewedAt, { scheduler, config }).card;
    } else if (item.event.action === 'undo') {
      card = restoreTier(card, tierSnapshotFromJson(item.event.undoTo));
    } else {
      card = manualTierChange(card, item.event.action, item.event.at);
    }
  }
  return card;
}
