// @ts-check

/**
 * @param {{ db: InstanceType<import('better-sqlite3')> }} opts
 */
export function createSqliteReferralRepository({ db }) {
  /**
   * Record a referral. Returns null if the referee was already attributed (UNIQUE violation).
   * @param {{ campaignId: string|number, referrerAddress: string, refereeAddress: string }} opts
   */
  function create({ campaignId, referrerAddress, refereeAddress }) {
    const createdAt = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT OR IGNORE INTO referrals (campaign_id, referrer_address, referee_address, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(Number(campaignId), referrerAddress, refereeAddress, createdAt);

    if (info.changes === 0) return null;
    return {
      id: String(info.lastInsertRowid),
      campaignId: String(campaignId),
      referrerAddress,
      refereeAddress,
      createdAt,
    };
  }

  /**
   * Count how many referrals a referrer has for a campaign.
   * @param {string|number} campaignId
   * @param {string} referrerAddress
   * @returns {number}
   */
  function countByReferrer(campaignId, referrerAddress) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM referrals
         WHERE campaign_id = ? AND referrer_address = ?`,
      )
      .get(Number(campaignId), referrerAddress);
    return row?.count ?? 0;
  }

  /**
   * List all referrals for a campaign.
   * @param {string|number} campaignId
   */
  function listByCampaign(campaignId) {
    const rows = db
      .prepare(`SELECT * FROM referrals WHERE campaign_id = ? ORDER BY created_at ASC`)
      .all(Number(campaignId));

    return rows.map((row) => ({
      id: String(row.id),
      campaignId: String(row.campaign_id),
      referrerAddress: row.referrer_address,
      refereeAddress: row.referee_address,
      createdAt: row.created_at,
    }));
  }

  function getByRefereeAndCampaign(campaignId, refereeAddress) {
    const row = db
      .prepare(`SELECT * FROM referrals WHERE campaign_id = ? AND referee_address = ?`)
      .get(Number(campaignId), refereeAddress);

    if (!row) return null;
    return {
      id: String(row.id),
      campaignId: String(row.campaign_id),
      referrerAddress: row.referrer_address,
      refereeAddress: row.referee_address,
      createdAt: row.created_at,
    };
  }

  function listAll() {
    const rows = db.prepare(`SELECT * FROM referrals ORDER BY created_at ASC`).all();

    return rows.map((row) => ({
      id: String(row.id),
      campaignId: String(row.campaign_id),
      referrerAddress: row.referrer_address,
      refereeAddress: row.referee_address,
      createdAt: row.created_at,
    }));
  }

  /**
   * Top referrers for a campaign, ranked by referral count (most referrals first).
   * Ties (equal counts) share the same rank using standard competition ranking
   * (1, 1, 3, ...), so a tie never skips a visible position.
   * @param {string|number} campaignId
   * @param {{ limit?: number, offset?: number }} [opts]
   * @returns {{ rows: Array<{ referrerAddress: string, referralCount: number, rank: number, firstReferralAt: string }>, total: number }}
   */
  function getLeaderboard(campaignId, { limit = 20, offset = 0 } = {}) {
    const grouped = db
      .prepare(
        `SELECT referrer_address AS referrerAddress,
                COUNT(*) AS referralCount,
                MIN(created_at) AS firstReferralAt
         FROM referrals
         WHERE campaign_id = ?
         GROUP BY referrer_address
         ORDER BY referralCount DESC, firstReferralAt ASC`,
      )
      .all(Number(campaignId));

    let rank = 0;
    let lastCount = null;
    const ranked = /** @type {any[]} */ (grouped).map((row, index) => {
      if (row.referralCount !== lastCount) {
        rank = index + 1;
        lastCount = row.referralCount;
      }
      return { ...row, rank };
    });

    return { rows: ranked.slice(offset, offset + limit), total: ranked.length };
  }

  /**
   * A single referrer's rank within a campaign's referral leaderboard.
   * Returns null when the referrer has no referrals (unranked).
   * @param {string|number} campaignId
   * @param {string} referrerAddress
   * @returns {{ referralCount: number, rank: number } | null}
   */
  function getReferrerRank(campaignId, referrerAddress) {
    const referralCount = countByReferrer(campaignId, referrerAddress);
    if (referralCount === 0) return null;

    const row = /** @type {any} */ (
      db
        .prepare(
          `SELECT COUNT(*) AS aheadCount FROM (
             SELECT referrer_address, COUNT(*) AS c
             FROM referrals
             WHERE campaign_id = ?
             GROUP BY referrer_address
             HAVING c > ?
           )`,
        )
        .get(Number(campaignId), referralCount)
    );

    return { referralCount, rank: (row?.aheadCount ?? 0) + 1 };
  }

  return {
    create,
    countByReferrer,
    listByCampaign,
    getByRefereeAndCampaign,
    listAll,
    getLeaderboard,
    getReferrerRank,
  };
}
