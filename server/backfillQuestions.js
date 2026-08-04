// Backfill comprehension questions for dialogues/readings created before the
// feature existed. Idempotent: skips anything that already has questions, so
// it is safe to re-run. One AI call per item, sequential (never hammers the CLI).
//
//   npm run backfill:questions
import { db } from './db.js';
import { generateQuestionsFor } from './services/ai.js';
import { levelTarget } from './lib/level.js';

const hasQuestions = (json) => {
  try {
    return (JSON.parse(json || '[]') ?? []).length > 0;
  } catch {
    return false;
  }
};

const dialogues = db
  .prepare('SELECT id, user_id, title, lines_json, questions_json FROM dialogues')
  .all()
  .filter((d) => !hasQuestions(d.questions_json));
const readings = db
  .prepare('SELECT id, user_id, title, text_en, questions_json FROM readings')
  .all()
  .filter((r) => !hasQuestions(r.questions_json));

const total = dialogues.length + readings.length;
if (!total) {
  console.log('✅ Tudo já tem perguntas — nada a fazer.');
  process.exit(0);
}
console.log(`Gerando perguntas para ${total} item(ns): ${dialogues.length} diálogo(s), ${readings.length} leitura(s).`);
console.log('Uma chamada de IA por item — pode levar alguns minutos.\n');

const userOf = db.prepare('SELECT * FROM users WHERE id = ?');
let done = 0;
let failed = 0;

for (const d of dialogues) {
  const text = JSON.parse(d.lines_json).map((l) => `${l.speaker}: ${l.en}`).join('\n');
  try {
    const qs = await generateQuestionsFor(text, levelTarget(userOf.get(d.user_id)));
    db.prepare('UPDATE dialogues SET questions_json = ? WHERE id = ?').run(JSON.stringify(qs), d.id);
    console.log(`  ✓ diálogo "${d.title}" (${qs.length} perguntas)`);
    done++;
  } catch (e) {
    console.log(`  ✗ diálogo "${d.title}": ${e.message}`);
    failed++;
  }
}

for (const r of readings) {
  try {
    const qs = await generateQuestionsFor(r.text_en, levelTarget(userOf.get(r.user_id)));
    db.prepare('UPDATE readings SET questions_json = ? WHERE id = ?').run(JSON.stringify(qs), r.id);
    console.log(`  ✓ leitura "${r.title}" (${qs.length} perguntas)`);
    done++;
  } catch (e) {
    console.log(`  ✗ leitura "${r.title}": ${e.message}`);
    failed++;
  }
}

console.log(`\n${done} item(ns) atualizado(s)${failed ? `, ${failed} falha(s) — rode de novo para tentar os que faltaram` : ''}.`);
