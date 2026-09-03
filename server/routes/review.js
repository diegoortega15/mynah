import { db } from '../db.js';
import { schedule, dateAfter, today } from '../lib/srs.js';
import { setVocabProgress } from './progress.js';
import { ownerOf, requireOwner } from '../lib/ownership.js';
import { body } from '../lib/schemas.js';
import { pauseAfterReview } from '../lib/cardLifecycle.js';

export default async function reviewRoutes(app) {
  // Cards due today (new + due), with phrase text. `ahead=1` ignores the due
  // date and serves what comes next: FSRS legitimately leaves some days empty,
  // and a learner who wants their daily hour should not be told to go away.
  app.get('/api/users/:id/review', (req) => {
    const t = today();
    const ahead = req.query?.ahead === '1' || req.query?.ahead === 1;
    const rows = db
      .prepare(
        `SELECT c.id AS card_id, c.state, c.reps, c.due_date,
                c.stability, c.difficulty, c.lapses, c.interval_days, c.last_review, c.ease,
                p.text_en, p.translation_pt, p.context,
                d.name AS deck_name
           FROM cards c
           JOIN phrases p ON p.id = c.phrase_id
           JOIN decks d   ON d.id = p.deck_id
          WHERE d.user_id = ? AND c.paused_reason IS NULL${ahead ? '' : ' AND c.due_date <= ?'}
          ORDER BY (c.state = 'new') DESC, c.due_date ASC
          LIMIT ${ahead ? 20 : 100}`
      )
      .all(...(ahead ? [req.params.id] : [req.params.id, t]));

    // What each button would do to THIS card. Anki shows this and it is the
    // only way the choice is honest: "Difícil" on an old card can still mean
    // two weeks, which is not what the word suggests.
    return rows.map((c) => ({
      ...c,
      preview: {
        again: schedule(c, 'again').interval_days,
        hard: schedule(c, 'hard').interval_days,
        good: schedule(c, 'good').interval_days,
        easy: schedule(c, 'easy').interval_days,
      },
    }));
  });

  // Study stats for the dashboard.
  app.get('/api/users/:id/stats', (req) => {
    const t = today();
    const uid = req.params.id;
    const due = db
      .prepare(
        `SELECT COUNT(*) c FROM cards c JOIN phrases p ON p.id = c.phrase_id
           JOIN decks d ON d.id = p.deck_id
          WHERE d.user_id = ? AND c.paused_reason IS NULL AND c.due_date <= ?`
      )
      .get(uid, t).c;
    const total = db
      .prepare(
        `SELECT COUNT(*) c FROM cards c JOIN phrases p ON p.id = c.phrase_id
           JOIN decks d ON d.id = p.deck_id WHERE d.user_id = ?`
      )
      .get(uid).c;
    const reviewedToday = db
      .prepare(
        `SELECT COUNT(*) c FROM reviews r JOIN cards c ON c.id = r.card_id
           JOIN phrases p ON p.id = c.phrase_id JOIN decks d ON d.id = p.deck_id
          WHERE d.user_id = ? AND date(r.reviewed_at, 'localtime') = ?`
      )
      .get(uid, t).c;
    // When the queue is empty, "come back later" is useless without a date.
    const next = db
      .prepare(
        `SELECT c.due_date d, COUNT(*) n FROM cards c JOIN phrases p ON p.id = c.phrase_id
           JOIN decks dk ON dk.id = p.deck_id
          WHERE dk.user_id = ? AND c.paused_reason IS NULL AND c.due_date > ?
          GROUP BY c.due_date ORDER BY c.due_date LIMIT 1`
      )
      .get(uid, t);
    return { due, total, reviewedToday, nextDue: next?.d ?? null, nextCount: next?.n ?? 0 };
  });

  // Submit a review for one card (owner only — a review writes to the owner's
  // daily progress, so a mismatched profile must not be able to trigger it).
  app.post('/api/cards/:cardId/review', {
    schema: {
      params: { type: 'object', required: ['cardId'], properties: { cardId: { type: 'integer' } } },
      body: body(['rating'], { rating: { type: 'string', enum: ['again', 'hard', 'good', 'easy'] } }),
    },
  }, (req, reply) => {
    if (!requireOwner(reply, ownerOf.card(req.params.cardId), req.query.uid)) return;
    const { rating } = req.body ?? {};
    if (!['again', 'hard', 'good', 'easy'].includes(rating))
      return reply.code(400).send({ error: 'invalid rating' });

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.cardId);
    if (!card) return reply.code(404).send({ error: 'card not found' });

    const next = schedule(card, rating);
    const dueDate = dateAfter(next.interval_days);
    const pause = pauseAfterReview(next, rating);

    // One transaction: the card update, the review log and the daily-progress
    // mark land together or not at all.
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE cards SET ease = ?, interval_days = ?, reps = ?, state = ?, due_date = ?,
                stability = ?, difficulty = ?, lapses = ?, last_review = ? WHERE id = ?`
      ).run(
        next.ease, next.interval_days, next.reps, next.state, dueDate,
        next.stability, next.difficulty, next.lapses, next.last_review, card.id
      );
      db.prepare('INSERT INTO reviews (card_id, rating) VALUES (?, ?)').run(card.id, rating);

      // Does this review take the card out of the queue? (leech / mastered)
      if (pause) {
        db.prepare('UPDATE cards SET paused_reason = ?, paused_at = ? WHERE id = ?')
          .run(pause.reason, today(), card.id);
      }

      // Auto-mark the daily vocabulary block: done at the target (or when nothing is due).
      const owner = db
        .prepare(
          `SELECT d.user_id FROM cards c JOIN phrases p ON p.id = c.phrase_id
             JOIN decks d ON d.id = p.deck_id WHERE c.id = ?`
        )
        .get(card.id);
      if (owner) {
        const t = today();
        const reviewedToday = db
          .prepare(
            `SELECT COUNT(*) c FROM reviews r JOIN cards c ON c.id = r.card_id
               JOIN phrases p ON p.id = c.phrase_id JOIN decks d ON d.id = p.deck_id
              WHERE d.user_id = ? AND date(r.reviewed_at, 'localtime') = ?`
          )
          .get(owner.user_id, t).c;
        const due = db
          .prepare(
            `SELECT COUNT(*) c FROM cards c JOIN phrases p ON p.id = c.phrase_id
               JOIN decks d ON d.id = p.deck_id
              WHERE d.user_id = ? AND c.paused_reason IS NULL AND c.due_date <= ?`
          )
          .get(owner.user_id, t).c;
        setVocabProgress(owner.user_id, { reviewedToday, due });
      }
    });
    tx();

    return { ...next, due_date: dueDate, paused: pause?.reason ?? null };
  });

  // Cards that left the queue, so they are visible instead of silently gone.
  app.get('/api/users/:id/paused-cards', (req) =>
    db
      .prepare(
        `SELECT c.id AS card_id, c.paused_reason, c.paused_at, c.lapses, c.interval_days,
                p.text_en, p.translation_pt, d.name AS deck_name
           FROM cards c JOIN phrases p ON p.id = c.phrase_id JOIN decks d ON d.id = p.deck_id
          WHERE d.user_id = ? AND c.paused_reason IS NOT NULL
          ORDER BY c.paused_at DESC, c.id DESC`
      )
      .all(req.params.id)
  );

  // Put one back in rotation. A leech comes back due today with its failure
  // count reset — otherwise it would pause again on the very next mistake.
  app.post('/api/cards/:cardId/resume', {
    schema: { params: { type: 'object', required: ['cardId'], properties: { cardId: { type: 'integer' } } } },
  }, (req, reply) => {
    if (!requireOwner(reply, ownerOf.card(req.params.cardId), req.query.uid)) return;
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.cardId);
    if (!card) return reply.code(404).send({ error: 'card not found' });
    const wasLeech = card.paused_reason === 'leech';
    db.prepare(
      `UPDATE cards SET paused_reason = NULL, paused_at = NULL
         ${wasLeech ? ', lapses = 0, due_date = ?' : ''} WHERE id = ?`
    ).run(...(wasLeech ? [today(), card.id] : [card.id]));
    return { ok: true };
  });

  // Review load for the next two weeks: a queue you cannot see coming is a
  // queue that ambushes you with 9 cards on a Thursday.
  app.get('/api/users/:id/load', (req) => {
    const rows = db
      .prepare(
        `SELECT c.due_date d, COUNT(*) n FROM cards c JOIN phrases p ON p.id = c.phrase_id
           JOIN decks dk ON dk.id = p.deck_id
          WHERE dk.user_id = ? AND c.paused_reason IS NULL AND c.due_date <= date(?, '+13 day')
          GROUP BY c.due_date`
      )
      .all(req.params.id, today());
    const byDate = new Map(rows.map((r) => [r.d, r.n]));
    // Overdue cards all land on "today" — that is when the learner sees them.
    const overdue = rows.filter((r) => r.d < today()).reduce((a, r) => a + r.n, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const date = dateAfter(i);
      return { date, count: (byDate.get(date) ?? 0) + (i === 0 ? overdue : 0) };
    });
  });
}
