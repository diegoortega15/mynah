import { describe, it, expect } from 'vitest';
import { schedule, dateAfter, today, daysBetween } from '../lib/srs.js';

const newCard = () => ({ ease: 2.5, interval_days: 0, reps: 0, state: 'new', due_date: today() });

// A review-state card with FSRS memory (as if reviewed 10 days ago).
const seasoned = () => ({
  ease: 2.5,
  interval_days: 10,
  reps: 3,
  state: 'review',
  due_date: today(),
  stability: 10,
  difficulty: 5,
  lapses: 0,
  last_review: dateAfter(-10),
});

describe('schedule (FSRS)', () => {
  it('rejects an invalid rating', () => {
    expect(() => schedule(newCard(), 'nope')).toThrow(/invalid rating/);
  });

  it('first "good" schedules at least 1 day ahead with FSRS memory', () => {
    const n = schedule(newCard(), 'good');
    expect(n.interval_days).toBeGreaterThanOrEqual(1);
    expect(n.reps).toBe(1);
    expect(n.stability).toBeGreaterThan(0);
    expect(n.difficulty).toBeGreaterThanOrEqual(1);
    expect(n.difficulty).toBeLessThanOrEqual(10);
    expect(n.last_review).toBe(today());
  });

  it('successive "good" reviews grow the interval', () => {
    let card = newCard();
    let prev = 0;
    for (let i = 0; i < 4; i++) {
      const n = schedule(card, 'good');
      expect(n.interval_days).toBeGreaterThanOrEqual(prev);
      prev = n.interval_days;
      card = { ...card, ...n, due_date: dateAfter(n.interval_days), last_review: today() };
    }
    expect(prev).toBeGreaterThan(1);
  });

  it('"easy" schedules further than "hard" from the same card', () => {
    const hard = schedule(seasoned(), 'hard');
    const easy = schedule(seasoned(), 'easy');
    expect(easy.interval_days).toBeGreaterThan(hard.interval_days);
  });

  it('"again" on a review card counts a lapse and shortens the interval', () => {
    const n = schedule(seasoned(), 'again');
    expect(n.lapses).toBe(1);
    expect(n.interval_days).toBeLessThan(10);
  });

  it('a card migrated from SM-2 (backfilled stability) schedules cleanly', () => {
    const migrated = {
      ease: 1.8,
      interval_days: 6,
      reps: 4,
      state: 'review',
      due_date: today(),
      stability: 6, // = MAX(interval_days, 1) from the db.js backfill
      difficulty: 7.8, // = 5 + (2.5 - 1.8) * 4
      lapses: 0,
      last_review: null, // backfill doesn't know the real date
    };
    const n = schedule(migrated, 'good');
    expect(n.interval_days).toBeGreaterThanOrEqual(1);
    expect(n.stability).toBeGreaterThan(0);
  });

  it('never exceeds the maximum interval (365 days)', () => {
    const card = { ...seasoned(), stability: 300, interval_days: 300, last_review: dateAfter(-300) };
    const n = schedule(card, 'easy');
    expect(n.interval_days).toBeLessThanOrEqual(365);
  });
});

describe('date helpers', () => {
  it('dateAfter formats local YYYY-MM-DD', () => {
    expect(dateAfter(0)).toBe(today());
    expect(/^\d{4}-\d{2}-\d{2}$/.test(dateAfter(7))).toBe(true);
  });

  it('daysBetween counts whole days', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30);
  });
});
