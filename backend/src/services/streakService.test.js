/**
 * Unit tests for streakService (#947).
 */

import { describe, it, expect } from 'vitest';
import { createStreakService, bonusForStreak, toUTCDateString } from './streakService.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeService(todayStr) {
  return createStreakService({ today: new Date(todayStr + 'T12:00:00Z') });
}

// ─── bonusForStreak ───────────────────────────────────────────────────────────

describe('bonusForStreak', () => {
  it('returns 10 pts on day 1', () => expect(bonusForStreak(1)).toBe(10));
  it('returns 10 pts on day 2', () => expect(bonusForStreak(2)).toBe(10));
  it('returns 15 pts on day 3', () => expect(bonusForStreak(3)).toBe(15));
  it('returns 15 pts on day 6', () => expect(bonusForStreak(6)).toBe(15));
  it('returns 25 pts on day 7', () => expect(bonusForStreak(7)).toBe(25));
  it('returns 25 pts on day 13', () => expect(bonusForStreak(13)).toBe(25));
  it('returns 50 pts on day 14', () => expect(bonusForStreak(14)).toBe(50));
  it('returns 50 pts on day 100', () => expect(bonusForStreak(100)).toBe(50));
});

// ─── toUTCDateString ──────────────────────────────────────────────────────────

describe('toUTCDateString', () => {
  it('formats a date string as YYYY-MM-DD', () => {
    expect(toUTCDateString('2026-07-29T23:59:00Z')).toBe('2026-07-29');
  });
  it('accepts a Date object', () => {
    expect(toUTCDateString(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });
});

// ─── recordActivity ───────────────────────────────────────────────────────────

describe('recordActivity', () => {
  it('returns streakDays=1 and pointsEarned=10 on first activity', () => {
    const svc = makeService('2026-07-01');
    const result = svc.recordActivity('GADDR1');
    expect(result).toMatchObject({
      streakDays: 1,
      pointsEarned: 10,
      totalPoints: 10,
      alreadyCredited: false,
    });
  });

  it('returns alreadyCredited=true and pointsEarned=0 on same-day duplicate', () => {
    const svc = makeService('2026-07-01');
    svc.recordActivity('GADDR1');
    const result = svc.recordActivity('GADDR1');
    expect(result).toMatchObject({ alreadyCredited: true, pointsEarned: 0 });
  });

  it('increments streak on the next day', () => {
    const store = new Map();
    // Day 1
    createStreakService({ store, today: new Date('2026-07-01T12:00:00Z') }).recordActivity(
      'GADDR1',
    );
    // Day 2
    const r2 = createStreakService({
      store,
      today: new Date('2026-07-02T12:00:00Z'),
    }).recordActivity('GADDR1');
    expect(r2.streakDays).toBe(2);
    expect(r2.pointsEarned).toBe(10);
  });

  it('resets streak to 1 after a missed day', () => {
    const store = new Map();
    createStreakService({ store, today: new Date('2026-07-01T12:00:00Z') }).recordActivity(
      'GADDR1',
    );
    // Skip July 2nd — activity on July 3rd should reset
    const r3 = createStreakService({
      store,
      today: new Date('2026-07-03T12:00:00Z'),
    }).recordActivity('GADDR1');
    expect(r3.streakDays).toBe(1);
    expect(r3.pointsEarned).toBe(10);
  });

  it('awards 25 pts on day 7', () => {
    const store = new Map();
    let last;
    for (let day = 1; day <= 7; day++) {
      const d = new Date(`2026-07-0${day}T12:00:00Z`);
      last = createStreakService({ store, today: d }).recordActivity('GADDR7');
    }
    expect(last.streakDays).toBe(7);
    expect(last.pointsEarned).toBe(25);
  });

  it('awards 50 pts on day 14', () => {
    const store = new Map();
    let last;
    for (let day = 1; day <= 14; day++) {
      const dateStr = `2026-07-${String(day).padStart(2, '0')}T12:00:00Z`;
      last = createStreakService({ store, today: new Date(dateStr) }).recordActivity('GADDR14');
    }
    expect(last.streakDays).toBe(14);
    expect(last.pointsEarned).toBe(50);
  });

  it('accumulates totalPoints across multiple days', () => {
    const store = new Map();
    createStreakService({ store, today: new Date('2026-07-01T12:00:00Z') }).recordActivity('ACC');
    createStreakService({ store, today: new Date('2026-07-02T12:00:00Z') }).recordActivity('ACC');
    const r = createStreakService({
      store,
      today: new Date('2026-07-03T12:00:00Z'),
    }).recordActivity('ACC');
    // Day 1: 10, Day 2: 10, Day 3: 15 = 35
    expect(r.totalPoints).toBe(35);
  });

  it('isolates streaks per identity', () => {
    const svc = makeService('2026-07-01');
    svc.recordActivity('USER_A');
    const b = svc.recordActivity('USER_B');
    expect(b.streakDays).toBe(1);
  });
});

// ─── getStreak ────────────────────────────────────────────────────────────────

describe('getStreak', () => {
  it('returns null for unknown identity', () => {
    expect(makeService('2026-07-01').getStreak('UNKNOWN')).toBeNull();
  });

  it('returns the current record after activity', () => {
    const svc = makeService('2026-07-01');
    svc.recordActivity('GADDR1');
    const record = svc.getStreak('GADDR1');
    expect(record).toMatchObject({ streakDays: 1, lastActivityDate: '2026-07-01' });
  });

  it('does not modify state', () => {
    const svc = makeService('2026-07-01');
    svc.recordActivity('GADDR1');
    svc.getStreak('GADDR1');
    svc.getStreak('GADDR1');
    expect(svc.getStreak('GADDR1')?.streakDays).toBe(1);
  });
});

// ─── resetStreak ─────────────────────────────────────────────────────────────

describe('resetStreak', () => {
  it('clears the streak record', () => {
    const svc = makeService('2026-07-01');
    svc.recordActivity('GADDR1');
    svc.resetStreak('GADDR1');
    expect(svc.getStreak('GADDR1')).toBeNull();
  });

  it('allows a fresh streak to start after reset', () => {
    const svc = makeService('2026-07-01');
    svc.recordActivity('GADDR1');
    svc.resetStreak('GADDR1');
    const r = svc.recordActivity('GADDR1');
    expect(r.streakDays).toBe(1);
    expect(r.alreadyCredited).toBe(false);
  });

  it('is a no-op for unknown identity', () => {
    expect(() => makeService('2026-07-01').resetStreak('GHOST')).not.toThrow();
  });
});
