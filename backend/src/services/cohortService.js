// @ts-check

/**
 * Cohort and retention analysis service
 * Computes cohorts by registration period and retention curves by subsequent activity
 *
 * @param {object} params
 * @param {ReturnType<import('../dal/sqliteCohortRepository.js').createSqliteCohortRepository>} params.cohortRepo
 */
export function createCohortService({ cohortRepo }) {
  /**
   * Get period string based on granularity
   * @param {Date} date
   * @param {string} granularity - 'day', 'week', 'month'
   * @returns {string}
   */
  function getPeriodString(date, granularity) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    switch (granularity) {
      case 'day':
        return `${year}-${month}-${day}`;
      case 'week': {
        const weekNumber = getWeekNumber(date);
        return `${year}-W${String(weekNumber).padStart(2, '0')}`;
      }
      case 'month':
        return `${year}-${month}`;
      default:
        throw new Error(`Invalid granularity: ${granularity}`);
    }
  }

  /**
   * Get ISO week number
   * @param {Date} date
   * @returns {number}
   */
  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Get period start and end dates
   * @param {string} periodString
   * @param {string} granularity
   * @returns {{start: Date, end: Date}}
   */
  function getPeriodBounds(periodString, granularity) {
    if (granularity === 'day') {
      const [year, month, day] = periodString.split('-').map(Number);
      const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
      return { start, end };
    }

    if (granularity === 'week') {
      const [yearWeek, weekNum] = periodString.split('-W');
      const year = Number(yearWeek);
      const week = Number(weekNum);

      // Get first day of year
      const jan1 = new Date(Date.UTC(year, 0, 1));
      const jan1Day = jan1.getUTCDay() || 7; // Monday = 1, Sunday = 7

      // Calculate start of week 1
      const week1Start = new Date(jan1);
      week1Start.setUTCDate(jan1.getUTCDate() + (1 - jan1Day) + (week - 1) * 7);

      const start = week1Start;
      const end = new Date(week1Start);
      end.setUTCDate(start.getUTCDate() + 7);

      return { start, end };
    }

    if (granularity === 'month') {
      const [year, month] = periodString.split('-').map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      return { start, end };
    }

    throw new Error(`Invalid granularity: ${granularity}`);
  }

  /**
   * Calculate offset between two periods
   * @param {string} cohortPeriod
   * @param {string} activityPeriod
   * @param {string} granularity
   * @returns {number}
   */
  function calculateOffset(cohortPeriod, activityPeriod, granularity) {
    if (granularity === 'day') {
      const [y1, m1, d1] = cohortPeriod.split('-').map(Number);
      const [y2, m2, d2] = activityPeriod.split('-').map(Number);
      const date1 = new Date(Date.UTC(y1, m1 - 1, d1));
      const date2 = new Date(Date.UTC(y2, m2 - 1, d2));
      return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
    }

    if (granularity === 'week') {
      const [y1, w1] = cohortPeriod.split('-W').map(Number);
      const [y2, w2] = activityPeriod.split('-W').map(Number);
      return (y2 - y1) * 52 + (w2 - w1);
    }

    if (granularity === 'month') {
      const [y1, m1] = cohortPeriod.split('-').map(Number);
      const [y2, m2] = activityPeriod.split('-').map(Number);
      return (y2 - y1) * 12 + (m2 - m1);
    }

    return 0;
  }

  /**
   * Compute cohorts and retention curves from raw activity data
   * @param {number} campaignId
   * @param {string} granularity - 'day', 'week', 'month'
   * @param {string} metricType - 'claimed', 'active'
   * @returns {Promise<void>}
   */
  async function computeCohorts(campaignId, granularity = 'week', metricType = 'claimed') {
    // Get all user registration activities
    const registrations = cohortRepo.getUserActivities({
      campaignId,
      activityType: 'registered',
    });

    // Get all metric activities
    const activities = cohortRepo.getUserActivities({
      campaignId,
      activityType: metricType,
    });

    // Group registrations by cohort period
    /** @type {Map<string, Set<string>>} */
    const cohorts = new Map();

    for (const reg of registrations) {
      const regDate = new Date(reg.occurredAt);
      const periodString = getPeriodString(regDate, granularity);

      if (!cohorts.has(periodString)) {
        cohorts.set(periodString, new Set());
      }
      cohorts.get(periodString).add(reg.userAddress);
    }

    // Save cohort stats
    for (const [cohortPeriod, users] of cohorts.entries()) {
      const bounds = getPeriodBounds(cohortPeriod, granularity);
      cohortRepo.saveCohortStats({
        campaignId,
        cohortPeriod,
        cohortSize: users.size,
        granularity,
        periodStart: bounds.start.toISOString(),
        periodEnd: bounds.end.toISOString(),
      });
    }

    // Build user -> cohort mapping
    /** @type {Map<string, string>} */
    const userCohortMap = new Map();
    for (const [cohortPeriod, users] of cohorts.entries()) {
      for (const user of users) {
        userCohortMap.set(user, cohortPeriod);
      }
    }

    // Compute retention by cohort and offset
    /** @type {Map<string, Map<number, Set<string>>>} */
    const retentionByOffset = new Map();

    for (const activity of activities) {
      const userCohort = userCohortMap.get(activity.userAddress);
      if (!userCohort) continue; // User not in any cohort (shouldn't happen)

      const activityDate = new Date(activity.occurredAt);
      const activityPeriod = getPeriodString(activityDate, granularity);
      const offset = calculateOffset(userCohort, activityPeriod, granularity);

      if (offset < 0) continue; // Activity before registration (shouldn't happen)

      if (!retentionByOffset.has(userCohort)) {
        retentionByOffset.set(userCohort, new Map());
      }

      const cohortOffsets = retentionByOffset.get(userCohort);
      if (!cohortOffsets.has(offset)) {
        cohortOffsets.set(offset, new Set());
      }

      cohortOffsets.get(offset).add(activity.userAddress);
    }

    // Save retention data
    for (const [cohortPeriod, offsetMap] of retentionByOffset.entries()) {
      for (const [offset, users] of offsetMap.entries()) {
        cohortRepo.saveRetentionData({
          campaignId,
          cohortPeriod,
          offsetPeriod: offset,
          metricType,
          userCount: users.size,
          granularity,
        });
      }
    }
  }

  /**
   * Get cohort analysis with retention curves
   * @param {number} campaignId
   * @param {string} granularity - 'day', 'week', 'month'
   * @param {string} metricType - 'claimed', 'active'
   * @param {object} [options]
   * @param {boolean} [options.recompute=false] - Force recomputation
   * @returns {Promise<Array<{cohortPeriod: string, cohortSize: number, periodStart: string, periodEnd: string, retention: Array<{offset: number, userCount: number, retentionRate: number}>}>>}
   */
  async function getCohortAnalysis(
    campaignId,
    granularity = 'week',
    metricType = 'claimed',
    options = {},
  ) {
    const { recompute = false } = options;

    // Check if we need to compute
    const existingCohorts = cohortRepo.getCohorts(campaignId, granularity);

    if (existingCohorts.length === 0 || recompute) {
      if (recompute) {
        cohortRepo.clearCache(campaignId);
      }
      await computeCohorts(campaignId, granularity, metricType);
    }

    // Fetch cohorts
    const cohorts = cohortRepo.getCohorts(campaignId, granularity);

    // Fetch retention data for each cohort
    return cohorts.map((cohort) => {
      const retention = cohortRepo.getRetentionData(
        campaignId,
        cohort.cohortPeriod,
        metricType,
        granularity,
      );

      return {
        ...cohort,
        retention: retention.map((r) => ({
          offset: r.offsetPeriod,
          userCount: r.userCount,
          retentionRate: Number((r.retentionRate * 100).toFixed(2)),
        })),
      };
    });
  }

  /**
   * Get retention curve for a specific cohort
   * @param {number} campaignId
   * @param {string} cohortPeriod
   * @param {string} granularity
   * @param {string} metricType
   * @returns {Promise<{cohortPeriod: string, cohortSize: number, retention: Array<{offset: number, userCount: number, retentionRate: number}>}>}
   */
  async function getRetentionCurve(
    campaignId,
    cohortPeriod,
    granularity = 'week',
    metricType = 'claimed',
  ) {
    const cohortSize = cohortRepo.getCohortSize(campaignId, cohortPeriod, granularity);

    if (cohortSize === 0) {
      throw new Error(`Cohort not found: ${cohortPeriod}`);
    }

    const retention = cohortRepo.getRetentionData(
      campaignId,
      cohortPeriod,
      metricType,
      granularity,
    );

    return {
      cohortPeriod,
      cohortSize,
      retention: retention.map((r) => ({
        offset: r.offsetPeriod,
        userCount: r.userCount,
        retentionRate: Number((r.retentionRate * 100).toFixed(2)),
      })),
    };
  }

  /**
   * Record user registration
   * @param {number} campaignId
   * @param {string} userAddress
   * @param {string} [occurredAt] - ISO 8601 timestamp, defaults to now
   * @param {object} [metadata]
   */
  function recordRegistration(campaignId, userAddress, occurredAt, metadata = {}) {
    const timestamp = occurredAt || new Date().toISOString();
    return cohortRepo.recordActivity({
      campaignId,
      userAddress,
      activityType: 'registered',
      occurredAt: timestamp,
      metadata,
    });
  }

  /**
   * Record user claim activity
   * @param {number} campaignId
   * @param {string} userAddress
   * @param {string} [occurredAt] - ISO 8601 timestamp, defaults to now
   * @param {object} [metadata]
   */
  function recordClaim(campaignId, userAddress, occurredAt, metadata = {}) {
    const timestamp = occurredAt || new Date().toISOString();
    return cohortRepo.recordActivity({
      campaignId,
      userAddress,
      activityType: 'claimed',
      occurredAt: timestamp,
      metadata,
    });
  }

  /**
   * Record user active status
   * @param {number} campaignId
   * @param {string} userAddress
   * @param {string} [occurredAt] - ISO 8601 timestamp, defaults to now
   * @param {object} [metadata]
   */
  function recordActive(campaignId, userAddress, occurredAt, metadata = {}) {
    const timestamp = occurredAt || new Date().toISOString();
    return cohortRepo.recordActivity({
      campaignId,
      userAddress,
      activityType: 'active',
      occurredAt: timestamp,
      metadata,
    });
  }

  return {
    getCohortAnalysis,
    getRetentionCurve,
    computeCohorts,
    recordRegistration,
    recordClaim,
    recordActive,
  };
}
