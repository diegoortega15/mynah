import { db } from '../db.js';
import { daysBetween, today } from './srs.js';

// Dynamic difficulty (i+1): infer a CEFR-ish target for AI generation from the
// learner's actual performance, so the day-85 dialogue is harder than day-1's.
// Signals: plan day, recent writing error rate, shadowing scores, review lapses.

const BASE = { Básico: 0, Intermediário: 1, Avançado: 3 };
// index into this ladder = base + phase progression + performance adjustment
const LADDER = ['A2', 'B1', 'B1+', 'B2', 'B2+', 'C1'];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Returns { cefr, prompt } — `prompt` is the string handed to the AI.
export function levelTarget(user) {
  const base = BASE[user.level] ?? 1;
  const day = clamp(daysBetween(user.start_date, today()) + 1, 1, 90);
  const phaseBump = day > 60 ? 2 : day > 30 ? 1 : 0;

  // Performance adjustment (−1, 0 or +1) from recent signals.
  let score = 0;

  // Writing: error density in the last 5 corrected texts.
  const writings = db
    .prepare('SELECT user_text, feedback_json FROM writings WHERE user_id = ? ORDER BY id DESC LIMIT 5')
    .all(user.id);
  if (writings.length >= 2) {
    let words = 0;
    let errors = 0;
    for (const w of writings) {
      words += String(w.user_text).split(/\s+/).length;
      try {
        errors += (JSON.parse(w.feedback_json)?.errors ?? []).length;
      } catch {
        /* ignore */
      }
    }
    const perHundred = words ? (errors / words) * 100 : 0;
    if (perHundred < 3) score += 1;
    else if (perHundred > 8) score -= 1;
  }

  // Shadowing: average score of the last 10 attempts.
  const sh = db
    .prepare(
      "SELECT AVG(score) avg, COUNT(*) c FROM (SELECT score FROM speaking_logs WHERE user_id = ? AND mode = 'shadow' AND score IS NOT NULL ORDER BY id DESC LIMIT 10)"
    )
    .get(user.id);
  if (sh?.c >= 5) {
    if (sh.avg >= 85) score += 1;
    else if (sh.avg < 55) score -= 1;
  }

  // Reviews: lapse rate ('again') in the last 100 ratings.
  const rv = db
    .prepare(
      `SELECT COUNT(*) c, SUM(rating = 'again') lapses FROM
         (SELECT r.rating FROM reviews r JOIN cards c ON c.id = r.card_id
            JOIN phrases p ON p.id = c.phrase_id JOIN decks d ON d.id = p.deck_id
           WHERE d.user_id = ? ORDER BY r.id DESC LIMIT 100)`
    )
    .get(user.id);
  if (rv?.c >= 30) {
    const rate = rv.lapses / rv.c;
    if (rate < 0.1) score += 1;
    else if (rate > 0.3) score -= 1;
  }

  const adj = clamp(score, -1, 1);
  const idx = clamp(base + phaseBump + adj, 0, LADDER.length - 1);
  const cefr = LADDER[idx];
  return {
    cefr,
    prompt: `${cefr} (CEFR) — keep the language ~95% comprehensible at this level, with a few slightly harder words (i+1)`,
  };
}
