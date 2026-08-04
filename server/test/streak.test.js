import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db.js';
import { touchStreak } from '../lib/streak.js';
import { today, dateAfter } from '../lib/srs.js';

// Runs on the in-memory DB (test/setup.js).
function makeUser({ streak = 0, longest = 0, lastActive = null, freezes = 0 } = {}) {
  const info = db
    .prepare(
      'INSERT INTO users (name, level, start_date, streak, longest_streak, last_active, freezes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run('T', 'B1', today(), streak, longest, lastActive, freezes);
  return info.lastInsertRowid;
}
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

describe('touchStreak (com freeze semanal)', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM users').run();
  });

  it('primeiro dia começa streak 1', () => {
    const id = makeUser();
    touchStreak(id);
    expect(getUser(id).streak).toBe(1);
  });

  it('dia seguinte incrementa', () => {
    const id = makeUser({ streak: 3, lastActive: dateAfter(-1) });
    touchStreak(id);
    expect(getUser(id).streak).toBe(4);
  });

  it('não conta duas vezes no mesmo dia', () => {
    const id = makeUser({ streak: 3, lastActive: today() });
    touchStreak(id);
    expect(getUser(id).streak).toBe(3);
  });

  it('1 dia perdido COM freeze → streak continua e consome o freeze', () => {
    const id = makeUser({ streak: 10, lastActive: dateAfter(-2), freezes: 1 });
    touchStreak(id);
    const u = getUser(id);
    expect(u.streak).toBe(11);
    expect(u.freezes).toBe(0);
  });

  it('1 dia perdido SEM freeze → reseta para 1', () => {
    const id = makeUser({ streak: 10, lastActive: dateAfter(-2), freezes: 0 });
    touchStreak(id);
    expect(getUser(id).streak).toBe(1);
  });

  it('2 dias perdidos com só 1 freeze → reseta', () => {
    const id = makeUser({ streak: 10, lastActive: dateAfter(-3), freezes: 1 });
    touchStreak(id);
    const u = getUser(id);
    expect(u.streak).toBe(1);
    expect(u.freezes).toBe(1); // freeze não é gasto num reset
  });

  it('7º dia consecutivo ganha 1 freeze (máx 2)', () => {
    const id = makeUser({ streak: 6, lastActive: dateAfter(-1), freezes: 0 });
    touchStreak(id);
    const u = getUser(id);
    expect(u.streak).toBe(7);
    expect(u.freezes).toBe(1);

    const id2 = makeUser({ streak: 13, lastActive: dateAfter(-1), freezes: 2 });
    touchStreak(id2);
    expect(getUser(id2).freezes).toBe(2); // capped
  });

  it('atualiza longest_streak', () => {
    const id = makeUser({ streak: 5, longest: 5, lastActive: dateAfter(-1) });
    touchStreak(id);
    expect(getUser(id).longest_streak).toBe(6);
  });
});
