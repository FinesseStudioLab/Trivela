// @ts-check

/**
 * Repository for cohort and retention data access
 * @param {{db: any}} params
 */
export function createSqliteCohortRepository({ db }) {
  /**
   * Record a user activity event
   * @param {object} params
   * @param {number} params.campaignId
   * @param {string} params.userAddress
   * @param {string} params.activityType - 'registered', 'claimed', 'active'
   * @param {string} params.occurredAt - ISO 8601 timestamp
   * @param {number} [params.ledger]
   * @param {string} [params.txHash]
   * @param {object} [params.metadata]
   */
  function recordActivity({
    campaignId,
    userAddress,
    activityType,
    occurredAt,
    ledger,
    txHash,
    metadata = {},
  }) {
    const stmt = db.prepare(`
      INSERT INTO user_activities 
        (campaign_id, user_address, activity_type, occurred_at, ledger, tx_hash, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      Number(campaignId),
      userAddress,
      activityType,
      occurredAt,
      ledger || null,
      txHash || null,
      JSON.stringify(metadata),
    );
  }

  /**
   * Get cohort size for a specific period
   * @param {number} campaignId
   * @param {string} cohortPeriod - e.g., '2024-W01', '2024-01', '2024-01-01'
   * @param {string} granularity - 'day', 'week', 'month'
   * @returns {number}
   */
  function getCohortSize(campaignId, cohortPeriod, granularity) {
    const stmt = db.prepare(`
      SELECT cohort_size 
      FROM cohort_stats 
      WHERE campaign_id = ? AND cohort_period = ? AND granularity = ?
    `);

    const row = stmt.get(Number(campaignId), cohortPeriod, granularity);
    return row?.cohort_size || 0;
  }

  /**
   * Save precomputed cohort statistics
   * @param {object} params
   * @param {number} params.campaignId
   * @param {string} params.cohortPeriod
   * @param {number} params.cohortSize
   * @param {string} params.granularity
   * @param {string} params.periodStart
   * @param {string} params.periodEnd
   */
  function saveCohortStats({
    campaignId,
    cohortPeriod,
    cohortSize,
    granularity,
    periodStart,
    periodEnd,
  }) {
    const stmt = db.prepare(`
      INSERT INTO cohort_stats 
        (campaign_id, cohort_period, cohort_size, granularity, period_start, period_end)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, cohort_period, granularity)
      DO UPDATE SET 
        cohort_size = excluded.cohort_size,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        computed_at = datetime('now')
    `);

    return stmt.run(
      Number(campaignId),
      cohortPeriod,
      cohortSize,
      granularity,
      periodStart,
      periodEnd,
    );
  }

  /**
   * Save precomputed retention data
   * @param {object} params
   * @param {number} params.campaignId
   * @param {string} params.cohortPeriod
   * @param {number} params.offsetPeriod
   * @param {string} params.metricType - 'claimed', 'active'
   * @param {number} params.userCount
   * @param {string} params.granularity
   */
  function saveRetentionData({
    campaignId,
    cohortPeriod,
    offsetPeriod,
    metricType,
    userCount,
    granularity,
  }) {
    const stmt = db.prepare(`
      INSERT INTO retention_data 
        (campaign_id, cohort_period, offset_period, metric_type, user_count, granularity)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, cohort_period, offset_period, metric_type, granularity)
      DO UPDATE SET 
        user_count = excluded.user_count,
        computed_at = datetime('now')
    `);

    return stmt.run(
      Number(campaignId),
      cohortPeriod,
      offsetPeriod,
      metricType,
      userCount,
      granularity,
    );
  }

  /**
   * Get retention data for a cohort
   * @param {number} campaignId
   * @param {string} cohortPeriod
   * @param {string} metricType
   * @param {string} granularity
   * @returns {Array<{offsetPeriod: number, userCount: number, retentionRate: number}>}
   */
  function getRetentionData(campaignId, cohortPeriod, metricType, granularity) {
    const stmt = db.prepare(`
      SELECT 
        r.offset_period as offsetPeriod,
        r.user_count as userCount,
        c.cohort_size as cohortSize,
        CASE 
          WHEN c.cohort_size > 0 
          THEN CAST(r.user_count AS REAL) / c.cohort_size 
          ELSE 0 
        END as retentionRate
      FROM retention_data r
      JOIN cohort_stats c 
        ON r.campaign_id = c.campaign_id 
        AND r.cohort_period = c.cohort_period 
        AND r.granularity = c.granularity
      WHERE r.campaign_id = ? 
        AND r.cohort_period = ? 
        AND r.metric_type = ?
        AND r.granularity = ?
      ORDER BY r.offset_period ASC
    `);

    return stmt.all(Number(campaignId), cohortPeriod, metricType, granularity);
  }

  /**
   * Get all cohort periods for a campaign
   * @param {number} campaignId
   * @param {string} granularity
   * @returns {Array<{cohortPeriod: string, cohortSize: number, periodStart: string, periodEnd: string}>}
   */
  function getCohorts(campaignId, granularity) {
    const stmt = db.prepare(`
      SELECT 
        cohort_period as cohortPeriod,
        cohort_size as cohortSize,
        period_start as periodStart,
        period_end as periodEnd
      FROM cohort_stats
      WHERE campaign_id = ? AND granularity = ?
      ORDER BY period_start ASC
    `);

    return stmt.all(Number(campaignId), granularity);
  }

  /**
   * Get user activities for analysis
   * @param {object} params
   * @param {number} params.campaignId
   * @param {string} [params.startDate]
   * @param {string} [params.endDate]
   * @param {string} [params.activityType]
   * @returns {Array<{userAddress: string, activityType: string, occurredAt: string}>}
   */
  function getUserActivities({ campaignId, startDate, endDate, activityType }) {
    let sql = `
      SELECT 
        user_address as userAddress,
        activity_type as activityType,
        occurred_at as occurredAt
      FROM user_activities
      WHERE campaign_id = ?
    `;

    /** @type {Array<number | string>} */
    const params = [Number(campaignId)];

    if (startDate) {
      sql += ` AND occurred_at >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND occurred_at < ?`;
      params.push(endDate);
    }

    if (activityType) {
      sql += ` AND activity_type = ?`;
      params.push(activityType);
    }

    sql += ` ORDER BY occurred_at ASC`;

    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Clear cached cohort and retention data for recomputation
   * @param {number} campaignId
   */
  function clearCache(campaignId) {
    db.prepare(`DELETE FROM cohort_stats WHERE campaign_id = ?`).run(Number(campaignId));
    db.prepare(`DELETE FROM retention_data WHERE campaign_id = ?`).run(Number(campaignId));
  }

  return {
    recordActivity,
    getCohortSize,
    saveCohortStats,
    saveRetentionData,
    getRetentionData,
    getCohorts,
    getUserActivities,
    clearCache,
  };
}
