import { db } from '../db.js';
import { today, daysBetween } from './srs.js';

export const PLAN_LENGTH = 90;

/**
 * Where the learner actually is in the 90-day plan.
 *
 * This used to be the calendar: `daysBetween(start_date, today) + 1`. That is
 * the wrong number to steer with, because the day drives the phase, the
 * milestones AND the difficulty bump in levelTarget — so someone who studied 9
 * days over 5 weeks was being served phase-2 content and harder English than
 * they had built up to. The calendar measured how long they had owned the app,
 * not how much of the plan they had done.
 *
 * So `day` counts days with real work (at least one block finished) and
 * `elapsed` keeps the calendar visible next to it: one answers "how much of the
 * plan have I done", the other "how long has this been going on". Both matter,
 * and neither should be hidden behind a setting.
 */
export function planDay(user) {
  const t = today();

  // Days before today on which at least one block was completed. A session row
  // with no block done means the app was opened and nothing was finished — that
  // is not a day of study.
  const rows = db
    .prepare('SELECT blocks_done_json FROM sessions WHERE user_id = ? AND date < ?')
    .all(user.id, t);
  const studied = rows.filter((r) => {
    try {
      return Object.values(JSON.parse(r.blocks_done_json || '{}')).some(Boolean);
    } catch {
      return false;
    }
  }).length;

  // Today is always the next day of the plan, whether or not it has been
  // started — "hoje é o dia 14" reads the same before and after you sit down.
  const day = Math.min(PLAN_LENGTH, studied + 1);
  const elapsed = Math.max(1, daysBetween(user.start_date, t) + 1);

  return { day, elapsed, studied, skipped: Math.max(0, elapsed - day) };
}
