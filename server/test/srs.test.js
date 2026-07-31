import { describe, it, expect } from 'vitest';
import { schedule, dateAfter, daysBetween } from '../lib/srs.js';

describe('SM-2 schedule()', () => {
  it('first "good" review → 1 day, reps 1, review state', () => {
    const r = schedule({ ease: 2.5, interval_days: 0, reps: 0 }, 'good');
    expect(r.reps).toBe(1);
    expect(r.interval_days).toBe(1);
    expect(r.state).toBe('review');
  });

  it('second "good" review → 6 days', () => {
    const r = schedule({ ease: 2.5, interval_days: 1, reps: 1 }, 'good');
    expect(r.reps).toBe(2);
    expect(r.interval_days).toBe(6);
  });

  it('"again" resets reps and stays due today (learning)', () => {
    const r = schedule({ ease: 2.5, interval_days: 6, reps: 3 }, 'again');
    expect(r.reps).toBe(0);
    expect(r.interval_days).toBe(0);
    expect(r.state).toBe('learning');
  });

  it('"easy" raises ease vs "good"', () => {
    const good = schedule({ ease: 2.5, interval_days: 1, reps: 1 }, 'good');
    const easy = schedule({ ease: 2.5, interval_days: 1, reps: 1 }, 'easy');
    expect(easy.ease).toBeGreaterThan(good.ease);
  });

  it('ease never drops below 1.3', () => {
    let card = { ease: 1.3, interval_days: 10, reps: 5 };
    for (let i = 0; i < 5; i++) card = { ...card, ...schedule(card, 'again') };
    expect(card.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('rejects an invalid rating', () => {
    expect(() => schedule({ ease: 2.5 }, 'nope')).toThrow();
  });
});

describe('daysBetween() / dateAfter()', () => {
  it('counts whole days between dates', () => {
    expect(daysBetween('2026-07-01', '2026-07-08')).toBe(7);
    expect(daysBetween('2026-07-08', '2026-07-08')).toBe(0);
  });

  it('dateAfter returns a local YYYY-MM-DD string', () => {
    expect(dateAfter(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
