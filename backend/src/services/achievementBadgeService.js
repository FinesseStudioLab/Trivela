/**
 * User achievement badges (#1247).
 *
 * Global badges are granted from aggregate milestone metrics derived from the
 * indexer projection tables (participants, credit_events, claim_events,
 * referral_credits). Everything in this module is pure so the calculator's
 * rules can be tested without a database.
 *
 * A badge is earned once its metric reaches the threshold. Badges are never
 * revoked: a user who later deregisters from a campaign keeps what they earned.
 */

/**
 * @typedef {'campaignsJoined' | 'creditsReceived' | 'pointsEarned' | 'claimsMade' | 'referralsMade'} BadgeMetric
 * @typedef {{ id: string, name: string, description: string, metric: BadgeMetric, threshold: number }} BadgeDefinition
 * @typedef {Record<BadgeMetric, number>} UserMetrics
 */

/** @type {readonly BadgeMetric[]} */
export const BADGE_METRICS = Object.freeze([
  'campaignsJoined',
  'creditsReceived',
  'pointsEarned',
  'claimsMade',
  'referralsMade',
]);

/** @type {readonly BadgeDefinition[]} */
export const BADGE_CATALOG = Object.freeze(
  [
    {
      id: 'first_steps',
      name: 'First Steps',
      description: 'Joined your first campaign',
      metric: 'campaignsJoined',
      threshold: 1,
    },
    {
      id: 'campaign_explorer',
      name: 'Campaign Explorer',
      description: 'Joined 5 campaigns',
      metric: 'campaignsJoined',
      threshold: 5,
    },
    {
      id: 'campaign_veteran',
      name: 'Campaign Veteran',
      description: 'Joined 25 campaigns',
      metric: 'campaignsJoined',
      threshold: 25,
    },
    {
      id: 'point_collector',
      name: 'Point Collector',
      description: 'Earned 1,000 points',
      metric: 'pointsEarned',
      threshold: 1_000,
    },
    {
      id: 'point_magnate',
      name: 'Point Magnate',
      description: 'Earned 10,000 points',
      metric: 'pointsEarned',
      threshold: 10_000,
    },
    {
      id: 'first_claim',
      name: 'First Claim',
      description: 'Claimed rewards for the first time',
      metric: 'claimsMade',
      threshold: 1,
    },
    {
      id: 'steady_claimer',
      name: 'Steady Claimer',
      description: 'Claimed rewards 10 times',
      metric: 'claimsMade',
      threshold: 10,
    },
    {
      id: 'connector',
      name: 'Connector',
      description: 'Referred your first user',
      metric: 'referralsMade',
      threshold: 1,
    },
    {
      id: 'ambassador',
      name: 'Ambassador',
      description: 'Referred 10 users',
      metric: 'referralsMade',
      threshold: 10,
    },
  ].map((badge) => Object.freeze(badge)),
);

const BADGE_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Throws on a malformed catalog so a bad definition fails at startup rather
 * than silently granting (or never granting) a badge.
 *
 * @param {readonly BadgeDefinition[]} catalog
 * @returns {readonly BadgeDefinition[]}
 */
export function validateBadgeCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new TypeError('Badge catalog must be a non-empty array');
  }

  const seen = new Set();
  for (const badge of catalog) {
    if (!badge || typeof badge !== 'object') {
      throw new TypeError('Badge definition must be an object');
    }
    if (typeof badge.id !== 'string' || !BADGE_ID_PATTERN.test(badge.id)) {
      throw new TypeError(`Invalid badge id: ${JSON.stringify(badge.id)}`);
    }
    if (seen.has(badge.id)) {
      throw new TypeError(`Duplicate badge id: ${badge.id}`);
    }
    seen.add(badge.id);
    if (!BADGE_METRICS.includes(badge.metric)) {
      throw new TypeError(`Badge ${badge.id} has unknown metric: ${JSON.stringify(badge.metric)}`);
    }
    if (!Number.isFinite(badge.threshold) || badge.threshold <= 0) {
      throw new TypeError(`Badge ${badge.id} threshold must be a positive finite number`);
    }
  }

  return catalog;
}

/**
 * Coerce raw aggregate values into non-negative finite numbers. Missing,
 * negative, or non-numeric values count as 0 so corrupt rows can never earn a
 * badge.
 *
 * @param {Partial<Record<BadgeMetric, unknown>> | null | undefined} raw
 * @returns {UserMetrics}
 */
export function normalizeMetrics(raw) {
  /** @type {any} */
  const metrics = {};
  for (const metric of BADGE_METRICS) {
    const value = Number(raw?.[metric]);
    metrics[metric] = Number.isFinite(value) && value > 0 ? value : 0;
  }
  return metrics;
}

/**
 * Badges whose threshold the metrics meet.
 *
 * @param {Partial<Record<BadgeMetric, unknown>>} rawMetrics
 * @param {readonly BadgeDefinition[]} [catalog]
 * @returns {{ badgeId: string, metricValue: number }[]}
 */
export function evaluateBadges(rawMetrics, catalog = BADGE_CATALOG) {
  const metrics = normalizeMetrics(rawMetrics);
  return catalog
    .filter((badge) => metrics[badge.metric] >= badge.threshold)
    .map((badge) => ({ badgeId: badge.id, metricValue: metrics[badge.metric] }));
}

/**
 * Per-badge progress toward each threshold, for display.
 *
 * @param {Partial<Record<BadgeMetric, unknown>>} rawMetrics
 * @param {readonly BadgeDefinition[]} [catalog]
 * @returns {{ badgeId: string, current: number, threshold: number, ratio: number, earned: boolean }[]}
 */
export function badgeProgress(rawMetrics, catalog = BADGE_CATALOG) {
  const metrics = normalizeMetrics(rawMetrics);
  return catalog.map((badge) => {
    const current = metrics[badge.metric];
    return {
      badgeId: badge.id,
      current,
      threshold: badge.threshold,
      ratio: Math.min(1, current / badge.threshold),
      earned: current >= badge.threshold,
    };
  });
}
