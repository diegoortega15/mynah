import { db } from '../db.js';
import { today } from '../lib/srs.js';
import { generatePack } from '../services/ai.js';

export default async function decksRoutes(app) {
  // List a user's decks with card counts.
  app.get('/api/users/:id/decks', (req) => {
    return db
      .prepare(
        `SELECT d.*,
                (SELECT COUNT(*) FROM phrases p JOIN cards c ON c.phrase_id = p.id
                  WHERE p.deck_id = d.id) AS card_count
           FROM decks d WHERE d.user_id = ? ORDER BY d.created_at DESC`
      )
      .all(req.params.id);
  });

  // Generate a vocabulary pack via Claude and store deck + phrases + cards.
  app.post('/api/users/:id/decks/generate', async (req, reply) => {
    const userId = req.params.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const { theme, count = 10 } = req.body ?? {};
    if (!theme || !theme.trim()) return reply.code(400).send({ error: 'theme required' });

    let items;
    try {
      items = await generatePack(theme.trim(), user.level, Math.min(20, count));
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'claude failed', detail: String(e.message) });
    }
    if (!items.length) return reply.code(502).send({ error: 'empty pack' });

    const insertDeck = db.prepare(
      'INSERT INTO decks (user_id, name, theme) VALUES (?, ?, ?)'
    );
    const insertPhrase = db.prepare(
      'INSERT INTO phrases (deck_id, text_en, translation_pt, context) VALUES (?, ?, ?, ?)'
    );
    const insertCard = db.prepare(
      'INSERT INTO cards (phrase_id, due_date, state) VALUES (?, ?, ?)'
    );

    const tx = db.transaction(() => {
      const deck = insertDeck.run(userId, theme.trim(), theme.trim());
      for (const it of items) {
        const p = insertPhrase.run(deck.lastInsertRowid, it.en, it.pt, it.context);
        insertCard.run(p.lastInsertRowid, today(), 'new');
      }
      return deck.lastInsertRowid;
    });

    const deckId = tx();
    return reply.code(201).send({ deck_id: deckId, added: items.length });
  });

  // Cards in a deck (for browsing before review).
  app.get('/api/decks/:deckId/cards', (req) => {
    return db
      .prepare(
        `SELECT c.id AS card_id, c.state, c.due_date, c.reps,
                p.id AS phrase_id, p.text_en, p.translation_pt, p.context
           FROM cards c JOIN phrases p ON p.id = c.phrase_id
          WHERE p.deck_id = ? ORDER BY c.id`
      )
      .all(req.params.deckId);
  });

  // Delete a single card (removes its phrase; the card cascades away).
  app.delete('/api/cards/:cardId', (req) => {
    const card = db.prepare('SELECT phrase_id FROM cards WHERE id = ?').get(req.params.cardId);
    if (card) db.prepare('DELETE FROM phrases WHERE id = ?').run(card.phrase_id);
    return { ok: true };
  });

  // Delete a deck (and its phrases/cards via cascade).
  app.delete('/api/decks/:deckId', (req) => {
    db.prepare('DELETE FROM decks WHERE id = ?').run(req.params.deckId);
    return { ok: true };
  });
}
