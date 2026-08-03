import { db } from '../db.js';
import { today } from './srs.js';

// Static starter pack: the first review works in 2 minutes, with zero AI —
// a new profile must never hit an AI error as its first experience.
export const STARTER_PHRASES = [
  { en: "Could you say that again, please?", pt: 'Você poderia repetir, por favor?', context: "Sorry, could you say that again? The audio cut out." },
  { en: "Let me get back to you on that.", pt: 'Deixa eu te retornar sobre isso.', context: "Good question — let me get back to you on that after lunch." },
  { en: "I'm running a bit late.", pt: 'Estou um pouco atrasado.', context: "Traffic is terrible — I'm running a bit late." },
  { en: "Does that work for you?", pt: 'Isso funciona para você?', context: "How about Thursday at 3pm — does that work for you?" },
  { en: "Just to be clear, the deadline is Friday.", pt: 'Só para deixar claro, o prazo é sexta-feira.', context: "Just to be clear, the deadline is Friday, not Monday." },
  { en: "I'll keep you posted.", pt: 'Vou te manter informado.', context: "We're waiting on the client — I'll keep you posted." },
  { en: "Can you walk me through it?", pt: 'Você pode me explicar passo a passo?', context: "I haven't seen this report before. Can you walk me through it?" },
  { en: "That makes sense.", pt: 'Faz sentido.', context: "Ah, that makes sense. Thanks for explaining." },
  { en: "I didn't catch that.", pt: 'Não entendi (não peguei o que você disse).', context: "Sorry, I didn't catch that — could you speak up?" },
  { en: "Let's touch base tomorrow.", pt: 'Vamos nos falar amanhã (alinhar).', context: "It's getting late — let's touch base tomorrow morning." },
  { en: "How's it going?", pt: 'Como vai? / Como estão as coisas?', context: "Hey! How's it going? Ready for the meeting?" },
  { en: "Thanks for your patience.", pt: 'Obrigado pela paciência.', context: "Thanks for your patience while we sorted this out." },
];

// Create the "Primeiros passos" deck for a user (idempotent per call site —
// only used right after profile creation and by the demo seed).
export function createStarterDeck(userId) {
  const insertDeck = db.prepare('INSERT INTO decks (user_id, name, theme) VALUES (?, ?, ?)');
  const insertPhrase = db.prepare(
    'INSERT INTO phrases (deck_id, text_en, translation_pt, context) VALUES (?, ?, ?, ?)'
  );
  const insertCard = db.prepare('INSERT INTO cards (phrase_id, due_date, state) VALUES (?, ?, ?)');

  const tx = db.transaction(() => {
    const deck = insertDeck.run(userId, 'Primeiros passos', 'starter');
    for (const p of STARTER_PHRASES) {
      const ph = insertPhrase.run(deck.lastInsertRowid, p.en, p.pt, p.context);
      insertCard.run(ph.lastInsertRowid, today(), 'new');
    }
    return deck.lastInsertRowid;
  });
  return tx();
}
