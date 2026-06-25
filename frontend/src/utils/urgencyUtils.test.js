import { describe, it, expect } from 'vitest';
import {
  getTimeRemaining,
  formatCountdown,
  isEndingSoon,
  isFillingFast,
  getFillPercentage,
  isJustLaunched,
  getUrgencyBadge,
  calculateUrgencyScore,
  BADGE_TYPES,
} from './urgencyUtils';

describe('urgencyUtils', () => {
  describe('getTimeRemaining', () => {
    it('calculates time remaining correctly', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const endDate = new Date('2025-01-15T12:30:00Z');

      const result = getTimeRemaining(endDate, now);

      expect(result).toEqual({
        hours: 2,
        minutes: 30,
        totalMs: 2.5 * 60 * 60 * 1000,
      });
    });

    it('returns null for past dates', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const endDate = new Date('2025-01-15T09:00:00Z');

      expect(getTimeRemaining(endDate, now)).toBeNull();
    });

    it('returns null for invalid dates', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      expect(getTimeRemaining('invalid-date', now)).toBeNull();
      expect(getTimeRemaining(null, now)).toBeNull();
      expect(getTimeRemaining(undefined, now)).toBeNull();
    });

    it('handles edge case of 0 time remaining', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const endDate = new Date('2025-01-15T10:00:00Z');

      const result = getTimeRemaining(endDate, now);
      expect(result).toEqual({ hours: 0, minutes: 0, totalMs: 0 });
    });
  });

  describe('formatCountdown', () => {
    it('formats hours and minutes correctly', () => {
      expect(formatCountdown(2, 30)).toBe('2h 30m');
      expect(formatCountdown(5, 15)).toBe('5h 15m');
    });

    it('formats hours only', () => {
      expect(formatCountdown(3, 0)).toBe('3h');
    });

    it('formats minutes only', () => {
      expect(formatCountdown(0, 45)).toBe('45m');
    });

    it('handles zero time', () => {
      expect(formatCountdown(0, 0)).toBe('Ending soon');
    });
  });

  describe('isEndingSoon', () => {
    it('returns true when less than 24 hours remaining', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const endDate = new Date('2025-01-16T09:59:59Z'); // 23h 59m 59s

      expect(isEndingSoon(endDate, now)).toBe(true);
    });

    it('returns false when 24 hours or more remaining', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const endDate = new Date('2025-01-16T10:00:01Z'); // 24h 0m 1s

      expect(isEndingSoon(endDate, now)).toBe(false);
    });

    it('returns false for invalid dates', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      expect(isEndingSoon(null, now)).toBe(false);
      expect(isEndingSoon(undefined, now)).toBe(false);
    });

    it('returns false for past dates', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const endDate = new Date('2025-01-14T10:00:00Z');

      expect(isEndingSoon(endDate, now)).toBe(false);
    });
  });

  describe('isFillingFast', () => {
    it('returns true when > 85% full', () => {
      expect(isFillingFast(86, 100)).toBe(true);
      expect(isFillingFast(90, 100)).toBe(true);
      expect(isFillingFast(95, 100)).toBe(true);
    });

    it('returns false when <= 85% full', () => {
      expect(isFillingFast(85, 100)).toBe(false);
      expect(isFillingFast(50, 100)).toBe(false);
      expect(isFillingFast(0, 100)).toBe(false);
    });

    it('returns false for unlimited capacity (maxCap = 0)', () => {
      expect(isFillingFast(1000, 0)).toBe(false);
    });

    it('returns false for invalid inputs', () => {
      expect(isFillingFast(null, 100)).toBe(false);
      expect(isFillingFast(undefined, 100)).toBe(false);
      expect(isFillingFast(50, null)).toBe(false);
    });

    it('handles edge case at exactly 85%', () => {
      expect(isFillingFast(85, 100)).toBe(false);
    });
  });

  describe('getFillPercentage', () => {
    it('calculates percentage correctly', () => {
      expect(getFillPercentage(50, 100)).toBe(50);
      expect(getFillPercentage(90, 100)).toBe(90);
      expect(getFillPercentage(33, 100)).toBe(33);
    });

    it('rounds to nearest integer', () => {
      expect(getFillPercentage(33, 100)).toBe(33);
      expect(getFillPercentage(67, 100)).toBe(67);
    });

    it('caps at 100%', () => {
      expect(getFillPercentage(150, 100)).toBe(100);
    });

    it('returns null for unlimited capacity', () => {
      expect(getFillPercentage(50, 0)).toBeNull();
    });

    it('returns null for invalid inputs', () => {
      expect(getFillPercentage(null, 100)).toBeNull();
      expect(getFillPercentage(undefined, 100)).toBeNull();
    });
  });

  describe('isJustLaunched', () => {
    it('returns true when less than 48 hours since start', () => {
      const now = new Date('2025-01-17T10:00:00Z');
      const startDate = new Date('2025-01-15T10:00:01Z'); // 47h 59m 59s ago

      expect(isJustLaunched(startDate, now)).toBe(true);
    });

    it('returns false when 48 hours or more since start', () => {
      const now = new Date('2025-01-17T10:00:01Z');
      const startDate = new Date('2025-01-15T10:00:00Z'); // 48h 0m 1s ago

      expect(isJustLaunched(startDate, now)).toBe(false);
    });

    it('returns false for future start dates', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      const startDate = new Date('2025-01-16T10:00:00Z');

      expect(isJustLaunched(startDate, now)).toBe(false);
    });

    it('returns false for invalid dates', () => {
      const now = new Date('2025-01-15T10:00:00Z');
      expect(isJustLaunched(null, now)).toBe(false);
      expect(isJustLaunched(undefined, now)).toBe(false);
    });
  });

  describe('getUrgencyBadge', () => {
    const now = new Date('2025-01-15T10:00:00Z');

    it('returns Ending Soon badge when < 24h remaining (highest priority)', () => {
      const campaign = {
        endDate: new Date('2025-01-16T05:30:00Z').toISOString(), // 19h 30m
        startDate: new Date('2025-01-15T09:00:00Z').toISOString(), // 1h ago
        participantCount: 90,
        maxParticipants: 100,
      };

      const badge = getUrgencyBadge(campaign, now);

      expect(badge).toEqual({
        type: BADGE_TYPES.ENDING_SOON,
        data: {
          hours: 19,
          minutes: 30,
          label: 'Ends in 19h 30m',
        },
      });
    });

    it('returns Filling Fast badge when > 85% full (second priority)', () => {
      const campaign = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(), // 5 days away
        startDate: new Date('2025-01-10T10:00:00Z').toISOString(), // 5 days ago
        participantCount: 90,
        maxParticipants: 100,
      };

      const badge = getUrgencyBadge(campaign, now);

      expect(badge).toEqual({
        type: BADGE_TYPES.FILLING_FAST,
        data: {
          percentage: 90,
          label: '90% full',
        },
      });
    });

    it('returns Just Launched badge when < 48h since start (lowest priority)', () => {
      const campaign = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(), // 5 days away
        startDate: new Date('2025-01-14T10:00:00Z').toISOString(), // 24h ago
        participantCount: 10,
        maxParticipants: 100,
      };

      const badge = getUrgencyBadge(campaign, now);

      expect(badge).toEqual({
        type: BADGE_TYPES.JUST_LAUNCHED,
        data: {
          label: 'New',
        },
      });
    });

    it('prioritizes Ending Soon over Filling Fast', () => {
      const campaign = {
        endDate: new Date('2025-01-16T05:00:00Z').toISOString(), // 19h away
        startDate: new Date('2025-01-10T10:00:00Z').toISOString(),
        participantCount: 95,
        maxParticipants: 100,
      };

      const badge = getUrgencyBadge(campaign, now);

      expect(badge.type).toBe(BADGE_TYPES.ENDING_SOON);
    });

    it('prioritizes Filling Fast over Just Launched', () => {
      const campaign = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(),
        startDate: new Date('2025-01-14T10:00:00Z').toISOString(), // 24h ago
        participantCount: 90,
        maxParticipants: 100,
      };

      const badge = getUrgencyBadge(campaign, now);

      expect(badge.type).toBe(BADGE_TYPES.FILLING_FAST);
    });

    it('returns null when no urgency conditions met', () => {
      const campaign = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(),
        startDate: new Date('2025-01-10T10:00:00Z').toISOString(),
        participantCount: 50,
        maxParticipants: 100,
      };

      expect(getUrgencyBadge(campaign, now)).toBeNull();
    });

    it('returns null for invalid campaign', () => {
      expect(getUrgencyBadge(null, now)).toBeNull();
      expect(getUrgencyBadge(undefined, now)).toBeNull();
    });

    it('handles unlimited capacity campaigns', () => {
      const campaign = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(),
        startDate: new Date('2025-01-14T10:00:00Z').toISOString(), // 24h ago
        participantCount: 1000,
        maxParticipants: 0, // unlimited
      };

      const badge = getUrgencyBadge(campaign, now);

      expect(badge.type).toBe(BADGE_TYPES.JUST_LAUNCHED);
    });
  });

  describe('calculateUrgencyScore', () => {
    const now = new Date('2025-01-15T10:00:00Z');

    it('assigns highest scores to campaigns ending soonest', () => {
      const campaign1h = {
        endDate: new Date('2025-01-15T11:00:00Z').toISOString(), // 1h
        participantCount: 10,
        maxParticipants: 100,
      };

      const campaign10h = {
        endDate: new Date('2025-01-15T20:00:00Z').toISOString(), // 10h
        participantCount: 10,
        maxParticipants: 100,
      };

      const score1h = calculateUrgencyScore(campaign1h, now);
      const score10h = calculateUrgencyScore(campaign10h, now);

      expect(score1h).toBeGreaterThan(score10h);
      expect(score1h).toBeGreaterThan(500_000); // In "ending soon" range
    });

    it('assigns medium scores to filling fast campaigns', () => {
      const campaign90 = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(), // 5 days
        participantCount: 90,
        maxParticipants: 100,
      };

      const campaign95 = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(),
        participantCount: 95,
        maxParticipants: 100,
      };

      const score90 = calculateUrgencyScore(campaign90, now);
      const score95 = calculateUrgencyScore(campaign95, now);

      expect(score95).toBeGreaterThan(score90);
      expect(score95).toBeLessThan(1_000_000);
      expect(score90).toBeGreaterThan(500_000);
    });

    it('assigns zero score to campaigns without urgency', () => {
      const campaign = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(),
        participantCount: 50,
        maxParticipants: 100,
      };

      expect(calculateUrgencyScore(campaign, now)).toBe(0);
    });

    it('returns 0 for invalid campaign', () => {
      expect(calculateUrgencyScore(null, now)).toBe(0);
      expect(calculateUrgencyScore(undefined, now)).toBe(0);
    });

    it('prioritizes ending soon over filling fast in scores', () => {
      const endingSoon = {
        endDate: new Date('2025-01-15T11:00:00Z').toISOString(), // 1h
        participantCount: 50,
        maxParticipants: 100,
      };

      const fillingFast = {
        endDate: new Date('2025-01-20T10:00:00Z').toISOString(),
        participantCount: 95,
        maxParticipants: 100,
      };

      const scoreEndingSoon = calculateUrgencyScore(endingSoon, now);
      const scoreFillingFast = calculateUrgencyScore(fillingFast, now);

      expect(scoreEndingSoon).toBeGreaterThan(scoreFillingFast);
    });
  });
});
