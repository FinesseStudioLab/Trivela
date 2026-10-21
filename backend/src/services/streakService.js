/**
 * Daily streak and login reward service (#947).
 *
 * Tracks consecutive-day participation per identity (wallet address).
 * Rules:
 *  • Activity on the same UTC calendar day only counts once.
 *  • Missing a full calendar day resets the streak to 1.
 *  • Bonus points scale with streak length:
 *      Day 1–2   →  10 pts (base)
 *      Day 3–6   →  15 pts
 *      Day 7–13  →  25 pts
 *      Day 14+   →  50 pts
 *
 * Anti-abuse: only one reward credit per identity per UTC day.
 */

/** @typedef {{ streakDays: number, lastActivityDate: string, totalPoints: number }} StreakRecord */

/**
 * @param {string} dateStr ISO-8601 date string or Date
 * @returns {string} YYYY-MM-DD in UTC
 */
export function toUTCDateString(dateStr) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the bonus points for a given streak length.
 * @param {number} streakDays
 * @returns {number}
 */
export function bonusForStreak(streakDays) {
  if (streakDays >= 14) return 50;
  if (streakDays >= 7) return 25;
  if (streakDays >= 3) return 15;
  return 10;
}

/**
 * @param {{ today?: Date }} [opts]
 */
export function createStreakService({ store = new Map(), today } = {}) {
  /** @type {Map<string, StreakRecord>} */
  const records = store;

  function nowDate() {
    return toUTCDateString(today ?? new Date());
  }

  /**
   * Record activity for `identity` and return the updated streak + points earned.
   * Returns null when the identity has already been credited today (anti-abuse).
   *
   * @param {string} identity wallet address or user id
   * @returns {{ streakDays: number, pointsEarned: number, totalPoints: number, alreadyCredited: boolean }}
   */
  function recordActivity(identity) {
    const todayStr = nowDate();
    const existing = records.get(identity);

    if (existing && existing.lastActivityDate === todayStr) {
      return {
        streakDays: existing.streakDays,
        pointsEarned: 0,
        totalPoints: existing.totalPoints,
        alreadyCredited: true,
      };
    }

    let streakDays = 1;
    if (existing) {
      const last = new Date(existing.lastActivityDate + 'T00:00:00Z');
      const now = new Date(todayStr + 'T00:00:00Z');
      const diffDays = Math.round((now.getTime() - last.getTime()) / 86_400_000);
      // Consecutive day: extend streak; 2+ days gap: reset
      streakDays = diffDays === 1 ? existing.streakDays + 1 : 1;
    }

    const pointsEarned = bonusForStreak(streakDays);
    const totalPoints = (existing?.totalPoints ?? 0) + pointsEarned;

    records.set(identity, { streakDays, lastActivityDate: todayStr, totalPoints });

    return { streakDays, pointsEarned, totalPoints, alreadyCredited: false };
  }

  /**
   * Read the current streak for `identity` without modifying state.
   * @param {string} identity
   * @returns {StreakRecord | null}
   */
  function getStreak(identity) {
    return records.get(identity) ?? null;
  }

  /**
   * Reset the streak for `identity` (e.g., after a ban or manual admin action).
   * @param {string} identity
   */
  function resetStreak(identity) {
    records.delete(identity);
  }

  return { recordActivity, getStreak, resetStreak };
}
