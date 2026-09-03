// When a card should leave the review queue.
//
// Until now nothing ever left: the queue only grew, and a card you kept getting
// wrong followed you forever. Both ends of that need an exit.

/**
 * Failing the same card this many times means the card is the problem — badly
 * worded, above the learner's level, or two ideas at once. Anki uses 8 and calls
 * it a "leech". Insisting past that spends the learner's hour on the one item
 * that is not teaching them anything.
 */
export const LEECH_LAPSES = 8;

/**
 * An interval past this is longer than what is left of the 90-day plan, so the
 * card would not come back inside it anyway. At that point it has been learned;
 * keeping it in rotation just pads the queue.
 */
export const MASTERED_DAYS = 60;

/**
 * Decide whether this review takes the card out of the queue.
 * Returns null to keep it active, or { reason } to pause it.
 *
 * `next` is the freshly scheduled card (already has the new interval/lapses),
 * `rating` is what the learner just pressed.
 */
export function pauseAfterReview(next, rating) {
  // Leech wins over mastery: a card with this many failures is not mastered,
  // whatever the interval says.
  if ((next.lapses ?? 0) >= LEECH_LAPSES) return { reason: 'leech' };

  // Only retire on a confident answer. Reaching a long interval by pressing
  // "Custou" is the scheduler's arithmetic, not a demonstration of mastery.
  if ((next.interval_days ?? 0) >= MASTERED_DAYS && (rating === 'good' || rating === 'easy')) {
    return { reason: 'mastered' };
  }
  return null;
}

export const PAUSE_LABEL = {
  leech: 'Problemático',
  mastered: 'Dominado',
};
