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

  return { create, countByReferrer, listByCampaign, getByRefereeAndCampaign, listAll };
}
