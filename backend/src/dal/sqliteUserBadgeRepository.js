/**
 * Achievement badge storage and milestone aggregation (#1247).
 *
 * Metrics are aggregated from the indexer projection tables (migration 033).
 * Users are paged by keyset (`user > afterUser ORDER BY user`) so the
 * calculator holds at most one batch in memory regardless of user count; each
 * branch of the user UNION filters on an indexed user column.
 */
export function createSqliteUserBadgeRepository({ db }) {
  const stmtListUserMetrics = db.prepare(`
    WITH batch AS (
      SELECT user FROM participants     WHERE user > @afterUser
      UNION
      SELECT user FROM credit_events    WHERE user > @afterUser
      UNION
      SELECT user FROM claim_events     WHERE user > @afterUser
      UNION
      SELECT referrer AS user FROM referral_credits WHERE referrer > @afterUser
      ORDER BY user
      LIMIT @limit
    )
    SELECT
      b.user,
      (SELECT COUNT(*) FROM participants p WHERE p.user = b.user) AS campaignsJoined,
      (SELECT COUNT(*) FROM credit_events c WHERE c.user = b.user) AS creditsReceived,
      (SELECT TOTAL(CAST(c.amount AS REAL)) FROM credit_events c WHERE c.user = b.user) AS pointsEarned,
      (SELECT COUNT(*) FROM claim_events k WHERE k.user = b.user) AS claimsMade,
      (SELECT COUNT(*) FROM referral_credits r WHERE r.referrer = b.user) AS referralsMade
    FROM batch b
    ORDER BY b.user
  `);

  const stmtUpsertProgress = db.prepare(`
    INSERT INTO user_milestone_progress
      (user, campaigns_joined, credits_received, points_earned, claims_made, referrals_made, computed_at)
    VALUES
      (@user, @campaignsJoined, @creditsReceived, @pointsEarned, @claimsMade, @referralsMade, @computedAt)
    ON CONFLICT(user) DO UPDATE SET
      campaigns_joined = excluded.campaigns_joined,
      credits_received = excluded.credits_received,
      points_earned    = excluded.points_earned,
      claims_made      = excluded.claims_made,
      referrals_made   = excluded.referrals_made,
      computed_at      = excluded.computed_at
  `);

  const stmtAwardBadge = db.prepare(`
    INSERT OR IGNORE INTO user_badges (user, badge_id, metric_value, awarded_at)
    VALUES (?, ?, ?, ?)
  `);

  const stmtListBadges = db.prepare(`
    SELECT badge_id AS badgeId, metric_value AS metricValue, awarded_at AS awardedAt
    FROM user_badges WHERE user = ? ORDER BY awarded_at, badge_id
  `);

  const stmtGetProgress = db.prepare(`
    SELECT
      campaigns_joined AS campaignsJoined,
      credits_received AS creditsReceived,
      points_earned    AS pointsEarned,
      claims_made      AS claimsMade,
      referrals_made   AS referralsMade,
      computed_at      AS computedAt
    FROM user_milestone_progress WHERE user = ?
  `);

  const saveTx = db.transaction(({ user, metrics, earned, computedAt }) => {
    stmtUpsertProgress.run({ user, ...metrics, computedAt });
    let awarded = 0;
    for (const { badgeId, metricValue } of earned) {
      awarded += stmtAwardBadge.run(user, badgeId, metricValue, computedAt).changes;
    }
    return awarded;
  });

  return {
    /**
     * Next page of users (ordered by address) with their aggregate metrics.
     * @param {{ afterUser?: string, limit: number }} opts
     */
    listUserMetrics({ afterUser = '', limit }) {
      return stmtListUserMetrics.all({ afterUser, limit });
    },

    /**
     * Atomically store the user's metric snapshot and grant any newly earned
     * badges. Already-held badges are left untouched.
     * @returns {number} badges newly granted
     */
    saveResults({ user, metrics, earned, computedAt }) {
      return saveTx({ user, metrics, earned, computedAt });
    },

    listBadges(user) {
      return stmtListBadges.all(user);
    },

    getProgress(user) {
      return stmtGetProgress.get(user) ?? null;
    },
  };
}
