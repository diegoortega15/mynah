// SM-2 spaced repetition (the classic Anki algorithm).
// rating: 'again' | 'hard' | 'good' | 'easy'
//
// Returns the updated scheduling fields for a card.

const Q = { again: 0, hard: 3, good: 4, easy: 5 };

export function schedule(card, rating) {
  const q = Q[rating];
  if (q === undefined) throw new Error(`invalid rating: ${rating}`);

  let ease = card.ease ?? 2.5;
  let interval = card.interval_days ?? 0;
  let reps = card.reps ?? 0;

  if (q < 3) {
    // Failed → relearn today (stays in today's queue).
    reps = 0;
    interval = 0;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);

    if (rating === 'hard') interval = Math.max(1, Math.round(interval * 0.8));
    if (rating === 'easy') interval = Math.round(interval * 1.3);
  }

  // SM-2 ease update
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;

  const state = q < 3 ? 'learning' : 'review';
  return { ease: Number(ease.toFixed(2)), interval_days: interval, reps, state };
}

// Local YYYY-MM-DD (avoids UTC off-by-one in BR timezone).
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateAfter(days, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return fmt(d);
}

export function today() {
  return fmt(new Date());
}

// Whole days between two YYYY-MM-DD strings (b - a).
export function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00');
  const dbb = new Date(b + 'T00:00:00');
  return Math.round((dbb - da) / 86400000);
}
