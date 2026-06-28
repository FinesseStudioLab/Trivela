/**
 * Urgency badge utilities for campaigns.
 * Provides logic for determining urgency signals and formatting countdown timers.
 */

/**
 * Calculate time remaining until a date
 * @param {string | Date} endDate - The end date
 * @param {Date} [now=new Date()] - Current time (injectable for testing)
 * @returns {{ hours: number, minutes: number, totalMs: number }}
 */
export function getTimeRemaining(endDate, now = new Date()) {
  if (!endDate) return null;

  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;

  const totalMs = end.getTime() - now.getTime();
  if (totalMs < 0) return null;

  const hours = Math.floor(totalMs / (1000 * 60 * 60));
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));

  return { hours, minutes, totalMs };
}

/**
 * Format countdown timer for "Ending Soon" badge
 * @param {number} hours
 * @param {number} minutes
 * @returns {string}
 */
export function formatCountdown(hours, minutes) {
  if (hours === 0 && minutes === 0) return 'Ending soon';
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Check if campaign is ending soon (< 24 hours)
 * @param {string | Date} endDate
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function isEndingSoon(endDate, now = new Date()) {
  const remaining = getTimeRemaining(endDate, now);
  if (!remaining) return false;

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  return remaining.totalMs < TWENTY_FOUR_HOURS_MS;
}

/**
 * Check if campaign is filling fast (> 85% capacity)
 * @param {number} participantCount
 * @param {number} maxCap
 * @returns {boolean}
 */
export function isFillingFast(participantCount, maxCap) {
  if (!maxCap || maxCap === 0) return false;
  if (participantCount === undefined || participantCount === null) return false;

  const fillPercentage = participantCount / maxCap;
  return fillPercentage > 0.85;
}

/**
 * Calculate fill percentage
 * @param {number} participantCount
 * @param {number} maxCap
 * @returns {number | null}
 */
export function getFillPercentage(participantCount, maxCap) {
  if (!maxCap || maxCap === 0) return null;
  if (participantCount === undefined || participantCount === null) return null;

  return Math.min(Math.round((participantCount / maxCap) * 100), 100);
}

/**
 * Check if campaign just launched (< 48 hours since start)
 * @param {string | Date} startDate
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function isJustLaunched(startDate, now = new Date()) {
  if (!startDate) return false;

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return false;

  const elapsedMs = now.getTime() - start.getTime();
  if (elapsedMs < 0) return false; // Not started yet

  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  return elapsedMs < FORTY_EIGHT_HOURS_MS;
}

/**
 * Badge types in priority order
 */
export const BADGE_TYPES = {
  ENDING_SOON: 'ending_soon',
  FILLING_FAST: 'filling_fast',
  JUST_LAUNCHED: 'just_launched',
};

/**
 * Determine which urgency badge to show (priority: Ending Soon > Filling Fast > Just Launched)
 * @param {object} campaign
 * @param {string} campaign.endDate
 * @param {string} campaign.startDate
 * @param {number} campaign.participantCount
 * @param {number} campaign.maxParticipants
 * @param {Date} [now=new Date()]
 * @returns {{ type: string, data: object } | null}
 */
export function getUrgencyBadge(campaign, now = new Date()) {
  if (!campaign) return null;

  const { endDate, startDate, participantCount = 0, maxParticipants = 0 } = campaign;

  // Priority 1: Ending Soon
  if (isEndingSoon(endDate, now)) {
    const remaining = getTimeRemaining(endDate, now);
    return {
      type: BADGE_TYPES.ENDING_SOON,
      data: {
        hours: remaining.hours,
        minutes: remaining.minutes,
        label: `Ends in ${formatCountdown(remaining.hours, remaining.minutes)}`,
      },
    };
  }

  // Priority 2: Filling Fast
  if (isFillingFast(participantCount, maxParticipants)) {
    const percentage = getFillPercentage(participantCount, maxParticipants);
    return {
      type: BADGE_TYPES.FILLING_FAST,
      data: {
        percentage,
        label: `${percentage}% full`,
      },
    };
  }

  // Priority 3: Just Launched
  if (isJustLaunched(startDate, now)) {
    return {
      type: BADGE_TYPES.JUST_LAUNCHED,
      data: {
        label: 'New',
      },
    };
  }

  return null;
}

/**
 * Calculate urgency score for sorting
 * Higher score = more urgent
 * @param {object} campaign
 * @param {Date} [now=new Date()]
 * @returns {number}
 */
export function calculateUrgencyScore(campaign, now = new Date()) {
  if (!campaign) return 0;

  let score = 0;
  const { endDate, participantCount = 0, maxParticipants = 0 } = campaign;

  // Ending soon: highest priority, score based on time remaining
  if (isEndingSoon(endDate, now)) {
    const remaining = getTimeRemaining(endDate, now);
    if (remaining) {
      // Score: 1,000,000 - milliseconds remaining (so sooner = higher score)
      score = 1_000_000 - Math.floor(remaining.totalMs / 1000);
    }
  }
  // Filling fast: second priority, score based on fill percentage
  else if (isFillingFast(participantCount, maxParticipants)) {
    const percentage = getFillPercentage(participantCount, maxParticipants);
    if (percentage !== null) {
      // Score: 500,000 + percentage * 100 (so fuller = higher score)
      score = 500_000 + percentage * 100;
    }
  }

  return score;
}
