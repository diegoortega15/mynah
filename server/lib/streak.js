import { db } from '../db.js';
import { today, daysBetween } from './srs.js';

// Bump the user's streak once per day. Called when the day is completed.
export function touchStreak(userId) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return;
  const t = today();
  if (u.last_active === t) return; // already counted today
  let streak = 1;
  if (u.last_active && daysBetween(u.last_active, t) === 1) streak = u.streak + 1;
  const longest = Math.max(streak, u.longest_streak);
  db.prepare('UPDATE users SET streak = ?, longest_streak = ?, last_active = ? WHERE id = ?')
    .run(streak, longest, t, userId);
}
