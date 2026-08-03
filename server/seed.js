// Demo seed: lets someone who just cloned the repo evaluate the app with zero
// AI configured. Creates a demo profile (if none exists) with the starter deck
// and one static dialogue. Run with: npm run seed
import { db } from './db.js';
import { today } from './lib/srs.js';
import { createStarterDeck } from './lib/starterDeck.js';

const DEMO_DIALOGUE = {
  title: 'First day on the team',
  theme: 'Meeting a coworker',
  lines: [
    { speaker: 'A', en: "Hi! You must be the new developer. I'm Sarah.", pt: 'Oi! Você deve ser a nova pessoa de desenvolvimento. Eu sou a Sarah.' },
    { speaker: 'B', en: "Nice to meet you, Sarah. I'm starting today.", pt: 'Prazer em te conhecer, Sarah. Estou começando hoje.' },
    { speaker: 'A', en: 'Welcome aboard! Have you met the rest of the team?', pt: 'Bem-vindo(a) a bordo! Já conheceu o resto do time?' },
    { speaker: 'B', en: 'Not yet. Could you introduce me?', pt: 'Ainda não. Você poderia me apresentar?' },
    { speaker: 'A', en: "Of course! We have a stand-up meeting in ten minutes.", pt: 'Claro! Temos uma reunião rápida em dez minutos.' },
    { speaker: 'B', en: "Perfect. What should I prepare?", pt: 'Perfeito. O que eu devo preparar?' },
    { speaker: 'A', en: "Nothing much — just say hi and tell us what you'll be working on.", pt: 'Nada demais — só diga oi e conte no que você vai trabalhar.' },
    { speaker: 'B', en: "Sounds good. Thanks for the warm welcome!", pt: 'Combinado. Obrigado(a) pela recepção calorosa!' },
  ],
};

const existing = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (existing > 0) {
  console.log(`Banco já tem ${existing} perfil(is) — seed ignorado (nada foi alterado).`);
  process.exit(0);
}

const info = db
  .prepare('INSERT INTO users (name, avatar, level, start_date) VALUES (?, ?, ?, ?)')
  .run('Demo', '🦉', 'Intermediário', today());
const uid = info.lastInsertRowid;
createStarterDeck(uid);
db.prepare('INSERT INTO dialogues (user_id, theme, title, lines_json) VALUES (?, ?, ?, ?)').run(
  uid,
  DEMO_DIALOGUE.theme,
  DEMO_DIALOGUE.title,
  JSON.stringify(DEMO_DIALOGUE.lines)
);

console.log('✅ Perfil "Demo" criado com o baralho "Primeiros passos" (12 frases) e 1 diálogo.');
console.log('   Rode o app e escolha o perfil Demo — dá para revisar cards e ouvir o diálogo sem IA.');
