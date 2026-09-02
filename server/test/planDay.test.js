import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db.js';
import { planDay } from '../lib/planDay.js';
import { today, dateAfter } from '../lib/srs.js';

// Runs on the in-memory DB (test/setup.js).
function makeUser(startDate) {
  return db
    .prepare('INSERT INTO users (name, level, start_date) VALUES (?, ?, ?)')
    .run('T', 'B1', startDate).lastInsertRowid;
}
// Blocks are stored as objects ({done, count, info}), not booleans — writing
// `{listen: true}` here made the old test pass for the wrong reason.
const block = (done = true, count = 1, extra = {}) => ({ done, count, info: '', ...extra });
const session = (uid, date, blocks) =>
  db
    .prepare('INSERT INTO sessions (user_id, date, blocks_done_json) VALUES (?, ?, ?)')
    .run(uid, date, JSON.stringify(blocks));
/** Um dia normal de estudo: um bloco concluído. */
const studyDay = (uid, date) => session(uid, date, { listen: block() });

// N days before today.
const ago = (n) => dateAfter(-n);

describe('planDay — dias estudados, não dias corridos', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM users').run();
  });

  it('quem nunca estudou está no dia 1, não no dia do calendário', () => {
    const uid = makeUser(ago(40));
    const r = planDay({ id: uid, start_date: ago(40) });
    expect(r.day).toBe(1);
    expect(r.elapsed).toBe(41);
    expect(r.skipped).toBe(40);
  });

  it('conta só os dias com pelo menos um bloco feito', () => {
    const start = ago(30);
    const uid = makeUser(start);
    studyDay(uid, ago(10));
    session(uid, ago(9), { listen: block(), vocab: block(), speak: block(), write: block() });
    session(uid, ago(8), {}); // abriu o app e não terminou nada
    session(uid, ago(7), { vocab: block() });
    const r = planDay({ id: uid, start_date: start });
    expect(r.studied).toBe(3); // o dia vazio não conta
    expect(r.day).toBe(4); // hoje é o próximo dia do plano
  });

  it('hoje é sempre o próximo dia, antes e depois de estudar', () => {
    const start = ago(5);
    const uid = makeUser(start);
    studyDay(uid, ago(1));
    const antes = planDay({ id: uid, start_date: start }).day;
    session(uid, today(), { listen: block(), vocab: block() });
    const depois = planDay({ id: uid, start_date: start }).day;
    expect(antes).toBe(2);
    expect(depois).toBe(2); // o dia não pula ao completar blocos de hoje
  });

  it('uma pausa longa não avança o plano', () => {
    const start = ago(60);
    const uid = makeUser(start);
    for (const d of [58, 57, 56]) studyDay(uid, ago(d));
    const r = planDay({ id: uid, start_date: start });
    expect(r.day).toBe(4);
    expect(r.elapsed).toBe(61);
    expect(r.skipped).toBe(57);
  });

  it('nunca passa de 90', () => {
    const start = ago(200);
    const uid = makeUser(start);
    for (let i = 1; i <= 120; i++) studyDay(uid, ago(i));
    expect(planDay({ id: uid, start_date: start }).day).toBe(90);
  });

  it('aguenta blocks_done_json corrompido sem quebrar', () => {
    const start = ago(3);
    const uid = makeUser(start);
    db.prepare('INSERT INTO sessions (user_id, date, blocks_done_json) VALUES (?, ?, ?)').run(
      uid,
      ago(1),
      'isto não é json'
    );
    expect(() => planDay({ id: uid, start_date: start })).not.toThrow();
    expect(planDay({ id: uid, start_date: start }).day).toBe(1);
  });

  // O bloco de vocabulário pode ser CONCEDIDO num dia em que o FSRS não agendou
  // nada. Isso salva o streak, mas não é estudo — abrir o app não pode avançar
  // o plano.
  it('não conta o bloco concedido automaticamente (auto)', () => {
    const start = ago(10);
    const uid = makeUser(start);
    session(uid, ago(3), { vocab: block(true, 0, { auto: true, info: 'Revisão em dia' }) });
    expect(planDay({ id: uid, start_date: start }).studied).toBe(0);
  });

  it('mas conta o dia se, além do concedido, houve trabalho de verdade', () => {
    const start = ago(10);
    const uid = makeUser(start);
    session(uid, ago(3), {
      vocab: block(true, 0, { auto: true }),
      listen: block(),
    });
    expect(planDay({ id: uid, start_date: start }).studied).toBe(1);
  });

  // Revisar 3 cards de 20 é estudo, mesmo sem fechar o bloco.
  it('conta progresso parcial (bloco não concluído, mas com contagem)', () => {
    const start = ago(10);
    const uid = makeUser(start);
    session(uid, ago(2), { vocab: block(false, 3, { info: '3/20 cards' }) });
    expect(planDay({ id: uid, start_date: start }).studied).toBe(1);
  });

  it('não conta um bloco zerado que só existe porque o app escreveu a linha', () => {
    const start = ago(10);
    const uid = makeUser(start);
    session(uid, ago(2), { vocab: block(false, 0) });
    expect(planDay({ id: uid, start_date: start }).studied).toBe(0);
  });
});
