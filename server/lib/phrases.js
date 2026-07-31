import { db } from '../db.js';
import { today } from './srs.js';

// Add a phrase to a user's deck (default "Frases do dia"), creating a due card.
export function addPhrase(userId, { en, pt = '', context = '' }, deckName = 'Frases do dia') {
  let deck = db.prepare('SELECT * FROM decks WHERE user_id = ? AND name = ?').get(userId, deckName);
  if (!deck) {
    const info = db
      .prepare('INSERT INTO decks (user_id, name, theme) VALUES (?, ?, ?)')
      .run(userId, deckName, 'daily');
    deck = { id: info.lastInsertRowid };
  }
  const p = db
    .prepare('INSERT INTO phrases (deck_id, text_en, translation_pt, context) VALUES (?, ?, ?, ?)')
    .run(deck.id, en.trim(), pt, context);
  db.prepare('INSERT INTO cards (phrase_id, due_date, state) VALUES (?, ?, ?)')
    .run(p.lastInsertRowid, today(), 'new');
  return p.lastInsertRowid;
}
