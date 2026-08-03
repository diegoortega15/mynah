import { db } from '../db.js';

// Store AI corrections so recurring mistakes become deliberate practice:
// visible to the user and injected back into the tutor/writing prompts.

export function recordErrors(userId, source, errors) {
  if (!Array.isArray(errors) || !errors.length) return;
  const ins = db.prepare(
    'INSERT INTO user_errors (user_id, source, original, correction, explanation, category) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const e of errors.slice(0, 10)) {
      const original = String(e.original ?? '').trim().slice(0, 300);
      const correction = String(e.correction ?? e.better ?? '').trim().slice(0, 300);
      if (!original || !correction) continue;
      ins.run(
        userId,
        source,
        original,
        correction,
        String(e.explanation ?? e.why ?? '').slice(0, 500),
        String(e.category ?? 'outros').toLowerCase().slice(0, 40)
      );
    }
  });
  tx();
}

// Most frequent error categories in the last 30 days.
export function topCategories(userId, limit = 5) {
  return db
    .prepare(
      `SELECT category, COUNT(*) AS count FROM user_errors
        WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY category ORDER BY count DESC, category LIMIT ?`
    )
    .all(userId, limit);
}

export function recentErrors(userId, limit = 10) {
  return db
    .prepare(
      `SELECT id, source, original, correction, explanation, category, created_at
         FROM user_errors WHERE user_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(userId, limit);
}
