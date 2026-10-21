// @ts-check
// Shared campaign-export data access, used by both the synchronous export
// endpoint (routes/campaignExport.js) and the async export worker
// (jobs/campaignExportWorker.js) so the two can never drift apart.

export const PARTICIPANT_COLUMNS = [
  'participantAddress',
  'registeredAt',
  'pointsCredited',
  'pointsClaimed',
  'netPoints',
  'referredBy',
];

/**
 * RFC 4180-compliant CSV serializer.
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} rows
 */
export function buildCsv(columns, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => escape(row[c])).join(','));
  return lines.join('\n') + '\n';
}

/**
 * Collect the participant rows for a campaign export.
 *
 * @param {InstanceType<import('better-sqlite3')>} db
 * @param {string | number} campaignId
 * @param {{ fromDate?: string | null, toDate?: string | null }} [range]
 * @returns {Record<string, any>[]}
 */
export function collectParticipants(db, campaignId, { fromDate = null, toDate = null } = {}) {
  const hasCreditEvents = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='credit_events'")
    .get();
  const hasClaimEvents = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='claim_events'")
    .get();

  let participants = [];

  if (hasCreditEvents) {
    const dateFilters = [];
    const vals = [String(campaignId)];
    if (fromDate) {
      dateFilters.push('r.created_at >= ?');
      vals.push(fromDate);
    }
    if (toDate) {
      dateFilters.push('r.created_at <= ?');
      vals.push(toDate);
    }
    const dateWhere = dateFilters.length ? `AND ${dateFilters.join(' AND ')}` : '';

    participants = db
      .prepare(
        `
      WITH participants AS (
        SELECT DISTINCT user FROM credit_events
      ),
      credited AS (
        SELECT user, SUM(CAST(amount AS INTEGER)) AS total FROM credit_events GROUP BY user
      ),
      claimed AS (
        SELECT user, SUM(CAST(amount AS INTEGER)) AS total FROM claim_events GROUP BY user
      )
      SELECT
        p.user                                       AS participantAddress,
        r.created_at                                 AS registeredAt,
        COALESCE(cr.total, 0)                        AS pointsCredited,
        COALESCE(cl.total, 0)                        AS pointsClaimed,
        COALESCE(cr.total, 0) - COALESCE(cl.total, 0) AS netPoints,
        ref.referrer_address                         AS referredBy
      FROM participants p
      LEFT JOIN referrals r
        ON r.referee_address = p.user AND r.campaign_id = ? ${dateWhere}
      LEFT JOIN credited cr ON cr.user = p.user
      LEFT JOIN ${hasClaimEvents ? 'claimed' : '(SELECT NULL AS user, 0 AS total) dummy_cl'} cl ON cl.user = p.user
      LEFT JOIN referrals ref
        ON ref.referee_address = p.user AND ref.campaign_id = ?
    `,
      )
      .all(...vals, String(campaignId));
  } else {
    // Fall back to referrals-only when event tables haven't been created yet
    const dateFilters = [];
    const vals = [String(campaignId)];
    if (fromDate) {
      dateFilters.push('created_at >= ?');
      vals.push(fromDate);
    }
    if (toDate) {
      dateFilters.push('created_at <= ?');
      vals.push(toDate);
    }
    const dateWhere = dateFilters.length ? `AND ${dateFilters.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `
      SELECT referee_address, referrer_address, created_at
      FROM referrals
      WHERE campaign_id = ? ${dateWhere}
      ORDER BY created_at ASC
    `,
      )
      .all(...vals);

    participants = rows.map((row) => ({
      participantAddress: row.referee_address,
      registeredAt: row.created_at,
      pointsCredited: 0,
      pointsClaimed: 0,
      netPoints: 0,
      referredBy: row.referrer_address ?? null,
    }));
  }

  return participants;
}
