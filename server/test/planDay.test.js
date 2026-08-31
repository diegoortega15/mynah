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
const session = (uid, date, blocks) =>
  db
    .prepare('INSERT INTO sessions (user_id, date, blocks_done_json) VALUES (?, ?, ?)')
    .run(uid, date, JSON.stringify(blocks));

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
    session(uid, ago(10), { listen: true });
    session(uid, ago(9), { listen: true, vocab: true, speak: true, write: true });
    session(uid, ago(8), {}); // abriu o app e não terminou nada
    session(uid, ago(7), { vocab: true });
    const r = planDay({ id: uid, start_date: start });
    expect(r.studied).toBe(3); // o dia vazio não conta
    expect(r.day).toBe(4); // hoje é o próximo dia do plano
  });

  it('hoje é sempre o próximo dia, antes e depois de estudar', () => {
    const start = ago(5);
    const uid = makeUser(start);
    session(uid, ago(1), { listen: true });
    const antes = planDay({ id: uid, start_date: start }).day;
    session(uid, today(), { listen: true, vocab: true });
    const depois = planDay({ id: uid, start_date: start }).day;
    expect(antes).toBe(2);
    expect(depois).toBe(2); // o dia não pula ao completar blocos de hoje
  });

  it('uma pausa longa não avança o plano', () => {
    const start = ago(60);
    const uid = makeUser(start);
    for (const d of [58, 57, 56]) session(uid, ago(d), { listen: true });
    const r = planDay({ id: uid, start_date: start });
    expect(r.day).toBe(4);
    expect(r.elapsed).toBe(61);
    expect(r.skipped).toBe(57);
  });

  it('nunca passa de 90', () => {
    const start = ago(200);
    const uid = makeUser(start);
    for (let i = 1; i <= 120; i++) session(uid, ago(i), { listen: true });
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
});
