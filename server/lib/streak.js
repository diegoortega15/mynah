import { db } from '../db.js';
import { today, daysBetween } from './srs.js';

// Bump the user's streak once per day. Called when the day is completed.
//
// Freezes: every 7 consecutive days earns 1 freeze (max 2 in stock). A freeze
// bridges a missed day so one trip/sick day doesn't wipe a 40-day streak —
// the "what-the-hell effect" kills more habits than the missed day itself.
export function touchStreak(userId) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return;
  const t = today();
  if (u.last_active === t) return; // already counted today

  let streak = 1;
  let freezes = u.freezes ?? 0;
  if (u.last_active) {
    const gap = daysBetween(u.last_active, t);
    if (gap === 1) {
      streak = u.streak + 1;
    } else if (gap > 1 && gap - 1 <= freezes) {
      freezes -= gap - 1; // spend one freeze per missed day
      streak = u.streak + 1;
    }
  }
  // Weekly reward: completing a 7th consecutive day grants a freeze (cap 2).
  if (streak > 0 && streak % 7 === 0) freezes = Math.min(2, freezes + 1);

  const longest = Math.max(streak, u.longest_streak);
  db.prepare(
    'UPDATE users SET streak = ?, longest_streak = ?, last_active = ?, freezes = ? WHERE id = ?'
  ).run(streak, longest, t, freezes, userId);
}
