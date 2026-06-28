/**
 * Urgency calculation utilities for backend campaign sorting.
 * Matches the frontend urgency logic for consistent behavior.
 */

/**
 * Check if campaign is ending soon (< 24 hours)
 * @param {string | null} endDate
 * @param {Date} [now]
 * @returns {boolean}
 */
function isEndingSoon(endDate, now = new Date()) {
  if (!endDate) return false;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return false;
  
  const remaining = end.getTime() - now.getTime();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  return remaining > 0 && remaining < TWENTY_FOUR_HOURS_MS;
}

/**
 * Check if campaign is filling fast (> 85% capacity)
 * @param {number} participantCount
 * @param {number} maxParticipants
 * @returns {boolean}
 */
function isFillingFast(participantCount, maxParticipants) {
  if (!maxParticipants || maxParticipants === 0) return false;
  if (participantCount === undefined || participantCount === null) return false;
  
  const fillPercentage = participantCount / maxParticipants;
  return fillPercentage > 0.85;
}

/**
 * Check if campaign just launched (< 48 hours since start)
 * @param {string | null} startDate
 * @param {Date} [now]
 * @returns {boolean}
 */
function isJustLaunched(startDate, now = new Date()) {
  if (!startDate) return false;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return false;
  
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < 0) return false; // Not started yet
  
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
  return elapsed < FORTY_EIGHT_HOURS_MS;
}

/**
 * Calculate urgency score for sorting.
 * Higher score = more urgent.
 * @param {object} campaign
 * @param {string | null} campaign.endDate
 * @param {string | null} campaign.startDate
 * @param {number} [campaign.participantCount]
 * @param {number} [campaign.maxParticipants]
 * @param {Date} [now]
 * @returns {number}
 */
export function calculateUrgencyScore(campaign, now = new Date()) {
  if (!campaign) return 0;
  
  const { endDate, startDate, participantCount = 0, maxParticipants = 0 } = campaign;
  
  // Priority 1: Ending soon - highest score based on time remaining
  if (isEndingSoon(endDate, now)) {
    const end = new Date(endDate);
    const remainingMs = end.getTime() - now.getTime();
    // Score: 1,000,000 - seconds remaining (sooner = higher score)
    return 1_000_000 - Math.floor(remainingMs / 1000);
  }
  
  // Priority 2: Filling fast - medium score based on fill percentage
  if (isFillingFast(participantCount, maxParticipants)) {
    const percentage = Math.min(Math.round((participantCount / maxParticipants) * 100), 100);
    // Score: 500,000 + percentage * 100 (fuller = higher score)
    return 500_000 + percentage * 100;
  }
  
  // Priority 3: Just launched - lower scores are just slightly elevated
  if (isJustLaunched(startDate, now)) {
    return 1000;
  }
  
  return 0;
}

/**
 * Sort campaigns by urgency (descending - most urgent first)
 * @param {Array<object>} campaigns
 * @param {Date} [now]
 * @returns {Array<object>}
 */
export function sortByUrgency(campaigns, now = new Date()) {
  return campaigns.slice().sort((a, b) => {
    const scoreA = calculateUrgencyScore(a, now);
    const scoreB = calculateUrgencyScore(b, now);
    
    // Higher urgency score first
    if (scoreB !== scoreA) return scoreB - scoreA;
    
    // Fallback: featured campaigns first
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    
    // Final fallback: ID ascending
    return Number(a.id) - Number(b.id);
  });
}
