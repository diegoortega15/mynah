import { db } from '../db.js';
import { BLOCKS } from './progress.js';

export default async function historyRoutes(app) {
  // All days with per-block completion status.
  app.get('/api/users/:id/history', (req) => {
    const rows = db
      .prepare('SELECT date, blocks_done_json FROM sessions WHERE user_id = ? ORDER BY date')
      .all(req.params.id);
    return rows.map((r) => {
      let b = {};
      try {
        b = JSON.parse(r.blocks_done_json || '{}');
      } catch {}
      const blocks = {};
      for (const k of BLOCKS) blocks[k] = !!(b[k] && b[k].done);
      const doneCount = BLOCKS.filter((k) => blocks[k]).length;
      return { date: r.date, blocks, doneCount, complete: doneCount === BLOCKS.length };
    });
  });

  // Detail of one day: block status/info + what was actually done.
  app.get('/api/users/:id/history/:date', (req) => {
    const uid = req.params.id;
    const date = req.params.date;

    const session = db
      .prepare('SELECT blocks_done_json FROM sessions WHERE user_id = ? AND date = ?')
      .get(uid, date);
    let blocks = {};
    if (session) {
      try {
        blocks = JSON.parse(session.blocks_done_json || '{}');
      } catch {}
    }
    const full = {};
    for (const k of BLOCKS) full[k] = blocks[k] || { done: false, info: '' };

    // Activities are stored in UTC; compare on local date to match the session day.
    const cardsReviewed = db
      .prepare(
        `SELECT COUNT(*) c FROM reviews r JOIN cards c ON c.id = r.card_id
           JOIN phrases p ON p.id = c.phrase_id JOIN decks d ON d.id = p.deck_id
          WHERE d.user_id = ? AND date(r.reviewed_at, 'localtime') = ?`
      )
      .get(uid, date).c;
    const dialogues = db
      .prepare(`SELECT title FROM dialogues WHERE user_id = ? AND date(created_at, 'localtime') = ? ORDER BY id`)
      .all(uid, date)
      .map((x) => x.title);
    const writings = db
      .prepare(`SELECT COUNT(*) c FROM writings WHERE user_id = ? AND date(created_at, 'localtime') = ?`)
      .get(uid, date).c;
    const speaking = db
      .prepare(`SELECT COUNT(*) c FROM speaking_logs WHERE user_id = ? AND date(created_at, 'localtime') = ?`)
      .get(uid, date).c;

    return { date, blocks: full, activity: { cardsReviewed, dialogues, writings, speaking } };
  });
}
