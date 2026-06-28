// @ts-check
import { Router } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const EXPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const EXPORT_RATE_LIMIT_MAX = 5;

/** @type {Map<string, { count: number, resetAt: number }>} */
const _exportBuckets = new Map();

function checkExportRateLimit(campaignId, actorKey) {
  const key = `${campaignId}:${actorKey}`;
  const now = Date.now();
  const bucket = _exportBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    _exportBuckets.set(key, { count: 1, resetAt: now + EXPORT_RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: EXPORT_RATE_LIMIT_MAX - 1, resetAt: now + EXPORT_RATE_LIMIT_WINDOW_MS };
  }
  if (bucket.count >= EXPORT_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: EXPORT_RATE_LIMIT_MAX - bucket.count, resetAt: bucket.resetAt };
}

/**
 * RFC 4180-compliant CSV serializer.
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} rows
 */
function buildCsv(columns, rows) {
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
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   campaignRepository: import('../dal/campaignRepository.js').CampaignRepository,
 *   auditLogRepository: import('../dal/auditLogRepository.js').AuditLogRepository,
 *   requireApiKey: import('express').RequestHandler,
 * }} options
 */
export function createCampaignExportRoute({ db, campaignRepository, auditLogRepository, requireApiKey }) {
  const router = Router();

  router.get('/campaigns/:id/export', requireApiKey, async (req, res) => {
    const { id } = req.params;
    const format = String(req.query.format ?? 'csv').toLowerCase();
    const fromDate = typeof req.query.from === 'string' ? req.query.from : null;
    const toDate = typeof req.query.to === 'string' ? req.query.to : null;

    if (format !== 'csv' && format !== 'json') {
      return res.status(400).json({ error: 'Invalid format. Use ?format=csv or ?format=json', code: 'INVALID_FORMAT' });
    }

    const campaign = campaignRepository.getById(id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' });
    }

    const actorKey = String(req.headers['x-api-key'] ?? req.query.api_key ?? req.ip ?? 'anon');
    const { allowed, remaining, resetAt } = checkExportRateLimit(id, actorKey);
    res.setHeader('X-RateLimit-Limit', String(EXPORT_RATE_LIMIT_MAX));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (!allowed) {
      res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
      return res.status(429).json({
        error: 'Export rate limit exceeded. Max 5 exports per campaign per hour.',
        code: 'EXPORT_RATE_LIMIT_EXCEEDED',
      });
    }

    const hasCreditEvents = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='credit_events'").get();
    const hasClaimEvents = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='claim_events'").get();

    let participants = [];

    if (hasCreditEvents) {
      const dateFilters = [];
      const vals = [String(id)];
      if (fromDate) { dateFilters.push("r.created_at >= ?"); vals.push(fromDate); }
      if (toDate) { dateFilters.push("r.created_at <= ?"); vals.push(toDate); }
      const dateWhere = dateFilters.length ? `AND ${dateFilters.join(' AND ')}` : '';

      participants = db.prepare(`
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
      `).all(...vals, String(id));
    } else {
      // Fall back to referrals-only when event tables haven't been created yet
      const dateFilters = [];
      const vals = [String(id)];
      if (fromDate) { dateFilters.push("created_at >= ?"); vals.push(fromDate); }
      if (toDate) { dateFilters.push("created_at <= ?"); vals.push(toDate); }
      const dateWhere = dateFilters.length ? `AND ${dateFilters.join(' AND ')}` : '';

      const rows = db.prepare(`
        SELECT referee_address, referrer_address, created_at
        FROM referrals
        WHERE campaign_id = ? ${dateWhere}
        ORDER BY created_at ASC
      `).all(...vals);

      participants = rows.map((row) => ({
        participantAddress: row.referee_address,
        registeredAt: row.created_at,
        pointsCredited: 0,
        pointsClaimed: 0,
        netPoints: 0,
        referredBy: row.referrer_address ?? null,
      }));
    }

    try {
      auditLogRepository.create({
        actor: actorKey,
        action: 'campaign.export',
        entity: 'campaign',
        entityId: id,
        diff: { format, fromDate, toDate, rowCount: participants.length },
      });
    } catch (_err) { /* non-fatal */ }

    const filename = `campaign-${id}-export.${format}`;

    if (format === 'csv') {
      const columns = ['participantAddress', 'registeredAt', 'pointsCredited', 'pointsClaimed', 'netPoints', 'referredBy'];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await pipeline(Readable.from([buildCsv(columns, participants)]), res);
    } else {
      const payload = JSON.stringify({ campaign: { id: campaign.id, name: campaign.name }, participants }, null, 2);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await pipeline(Readable.from([payload]), res);
    }
  });

  return router;
}
