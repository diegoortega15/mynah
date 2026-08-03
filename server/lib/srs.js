// Spaced repetition via FSRS (ts-fsrs) — the modern scheduler used by Anki.
// ~20-30% fewer reviews than SM-2 for the same retention, and no "ease hell".
// rating: 'again' | 'hard' | 'good' | 'easy'
//
// Day-level scheduling (enable_short_term: false): every rating lands on a
// date, never "in 10 minutes" — the app works in daily sessions, and the UI
// already requeues 'again' cards within the same session.
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs';

const RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
const STATE_TO_TEXT = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};
const TEXT_TO_STATE = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const engine = fsrs(
  generatorParameters({
    enable_short_term: false,
    maximum_interval: 365, // the plan is 90 days; a year cap keeps dates sane
  })
);

// Rebuild an FSRS card object from a DB row. Rows migrated from SM-2 carry an
// approximated stability/difficulty (see db.js backfill); brand-new cards start
// from createEmptyCard.
function toFsrsCard(card, now) {
  if (card.stability == null || !card.state || card.state === 'new') {
    return createEmptyCard(now);
  }
  return {
    due: new Date((card.due_date || today()) + 'T00:00:00'),
    stability: card.stability,
    difficulty: card.difficulty ?? 5,
    elapsed_days: card.last_review ? Math.max(0, daysBetween(card.last_review, today())) : 0,
    scheduled_days: card.interval_days ?? 0,
    reps: card.reps ?? 0,
    lapses: card.lapses ?? 0,
    learning_steps: 0,
    state: TEXT_TO_STATE[card.state] ?? State.Review,
    last_review: card.last_review ? new Date(card.last_review + 'T00:00:00') : undefined,
  };
}

export function schedule(card, rating) {
  const grade = RATING[rating];
  if (grade === undefined) throw new Error(`invalid rating: ${rating}`);

  const now = new Date();
  const next = engine.next(toFsrsCard(card, now), now, grade).card;

  return {
    ease: card.ease ?? 2.5, // legacy column, kept for rollback
    // ts-fsrs can exceed maximum_interval slightly on the easy path — clamp.
    interval_days: Math.min(next.scheduled_days, 365),
    reps: next.reps,
    state: STATE_TO_TEXT[next.state] ?? 'review',
    stability: Number(next.stability.toFixed(4)),
    difficulty: Number(next.difficulty.toFixed(4)),
    lapses: next.lapses,
    last_review: today(),
  };
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
