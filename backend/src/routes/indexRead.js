// #560 — Public read API over indexed data.
// All endpoints are read-only, rate-limited, and cursor-paginated.
// Responses include `as_of_ledger` (freshness indicator from indexer_checkpoints).
//
// Endpoints:
//   GET /index/campaigns/:id/participants  — paginated participant list from balances
//   GET /index/campaigns/:id/events        — paginated credit/claim event log
//   GET /index/addresses/:address/history  — full event history for one address
//   GET /index/campaigns/:id/stats         — rollup stats (cached by ETag)

import { Router } from 'express';
import { createHash } from 'node:crypto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const STATS_CACHE_TTL_MS = 30_000; // 30 s in-memory stats cache

/**
 * Decode an opaque cursor (base64-encoded JSON { after_rowid, after_id }).
 * @param {string | undefined} cursor
 * @returns {{ afterRowid?: number; afterId?: string } | null}
 */
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Encode a cursor from the last row.
 * @param {{ rowid?: number; id?: string }} row
 * @returns {string}
 */
function encodeCursor(row) {
  return Buffer.from(
    JSON.stringify({ afterRowid: row.rowid ?? null, afterId: row.id ?? null }),
  ).toString('base64url');
}

/**
 * Get the latest indexed ledger number from indexer_checkpoints.
 * @param {import('better-sqlite3').Database} db
 * @returns {number | null}
 */
function getAsOfLedger(db) {
  try {
    const row = db
      .prepare('SELECT ledger FROM indexer_checkpoints ORDER BY updated_at DESC LIMIT 1')
      .get();
    return row?.ledger ?? null;
  } catch {
    return null;
  }
}

/** @param {import('better-sqlite3').Database} db @param {string} tableName */
function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName),
  );
}

/**
 * @param {{
 *   dal: { db: import('better-sqlite3').Database };
 *   campaignRepository: { getById: Function };
 * }} options
 */
export function createIndexReadRoutes({ dal, campaignRepository }) {
  const router = Router();
  const db = dal.db;

  // In-memory ETag/stats cache
  const statsCache = new Map();

  // ── GET /index/campaigns/:id/participants ──────────────────────────────────
  router.get('/campaigns/:id/participants', (req, res) => {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'campaign not found', code: 'NOT_FOUND' });

    if (!tableExists(db, 'balances')) {
      return res.json({ data: [], cursor: null, as_of_ledger: null });
    }

    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const decoded = decodeCursor(req.query.cursor);
    const afterRowid = decoded?.afterRowid ?? 0;

    const rows = db
      .prepare(
        `SELECT rowid, user, balance FROM balances
         WHERE rowid > ?
         ORDER BY rowid ASC LIMIT ?`,
      )
      .all(afterRowid, limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;
    const as_of_ledger = getAsOfLedger(db);

    // ETag from last rowid + ledger
    const etag = `"${createHash('sha1')
      .update(`${page.at(-1)?.rowid ?? 0}:${as_of_ledger ?? 0}`)
      .digest('hex')
      .slice(0, 16)}"`;

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.set({
      ETag: etag,
      'Cache-Control': 'public, max-age=10, stale-while-revalidate=60',
    });

    return res.json({
      data: page.map((r) => ({ address: r.user, balance: r.balance })),
      cursor: nextCursor,
      has_more: hasMore,
      as_of_ledger,
    });
  });

  // ── GET /index/campaigns/:id/events ───────────────────────────────────────
  router.get('/campaigns/:id/events', (req, res) => {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'campaign not found', code: 'NOT_FOUND' });

    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const type = req.query.type; // 'credit' | 'claim' | undefined (all)
    const decoded = decodeCursor(req.query.cursor);
    const afterRowid = decoded?.afterRowid ?? 0;
    const as_of_ledger = getAsOfLedger(db);

    const events = [];

    const wantCredit = !type || type === 'credit';
    const wantClaim = !type || type === 'claim';

    if (wantCredit && tableExists(db, 'credit_events')) {
      const rows = db
        .prepare(
          `SELECT rowid, user, amount, ledger, tx_hash, 'credit' as type
           FROM credit_events WHERE rowid > ? ORDER BY rowid ASC LIMIT ?`,
        )
        .all(afterRowid, limit + 1);
      events.push(...rows);
    }
    if (wantClaim && tableExists(db, 'claim_events')) {
      const rows = db
        .prepare(
          `SELECT rowid, user, amount, ledger, tx_hash, 'claim' as type
           FROM claim_events WHERE rowid > ? ORDER BY rowid ASC LIMIT ?`,
        )
        .all(afterRowid, limit + 1);
      events.push(...rows);
    }

    // Sort combined set by rowid, apply limit
    events.sort((a, b) => (a.rowid ?? 0) - (b.rowid ?? 0));
    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

    const etag = `"${createHash('sha1')
      .update(`${page.at(-1)?.rowid ?? 0}:${as_of_ledger ?? 0}:${type ?? 'all'}`)
      .digest('hex')
      .slice(0, 16)}"`;

    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    res.set({ ETag: etag, 'Cache-Control': 'public, max-age=5, stale-while-revalidate=30' });

    return res.json({
      data: page.map(({ rowid, ...rest }) => rest),
      cursor: nextCursor,
      has_more: hasMore,
      as_of_ledger,
    });
  });

  // ── GET /index/addresses/:address/history ─────────────────────────────────
  router.get('/addresses/:address/history', (req, res) => {
    const { address } = req.params;
    if (!address) return res.status(400).json({ error: 'address is required' });

    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const decoded = decodeCursor(req.query.cursor);
    const afterRowid = decoded?.afterRowid ?? 0;
    const as_of_ledger = getAsOfLedger(db);

    const events = [];
    if (tableExists(db, 'credit_events')) {
      const rows = db
        .prepare(
          `SELECT rowid, user, amount, ledger, tx_hash, 'credit' as type
           FROM credit_events WHERE user = ? AND rowid > ?
           ORDER BY rowid ASC LIMIT ?`,
        )
        .all(address, afterRowid, limit + 1);
      events.push(...rows);
    }
    if (tableExists(db, 'claim_events')) {
      const rows = db
        .prepare(
          `SELECT rowid, user, amount, ledger, tx_hash, 'claim' as type
           FROM claim_events WHERE user = ? AND rowid > ?
           ORDER BY rowid ASC LIMIT ?`,
        )
        .all(address, afterRowid, limit + 1);
      events.push(...rows);
    }

    events.sort((a, b) => (a.rowid ?? 0) - (b.rowid ?? 0));
    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

    let balance = '0';
    if (tableExists(db, 'balances')) {
      const row = db.prepare('SELECT balance FROM balances WHERE user = ?').get(address);
      balance = row?.balance ?? '0';
    }

    return res.json({
      address,
      balance,
      data: page.map(({ rowid, ...rest }) => rest),
      cursor: nextCursor,
      has_more: hasMore,
      as_of_ledger,
    });
  });

  // ── GET /index/campaigns/:id/stats ────────────────────────────────────────
  router.get('/campaigns/:id/stats', (req, res) => {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'campaign not found', code: 'NOT_FOUND' });

    const campaignId = String(campaign.id);
    const as_of_ledger = getAsOfLedger(db);
    const cacheKey = `${campaignId}:${as_of_ledger}`;

    const cached = statsCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.at < STATS_CACHE_TTL_MS) {
      if (req.headers['if-none-match'] === cached.etag) return res.status(304).end();
      res.set({ ETag: cached.etag, 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' });
      return res.json(cached.data);
    }

    let totalParticipants = 0;
    let totalCredited = BigInt(0);
    let totalClaimed = BigInt(0);

    if (tableExists(db, 'balances')) {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM balances WHERE CAST(balance AS INTEGER) > 0').get();
      totalParticipants = row?.cnt ?? 0;
    }
    if (tableExists(db, 'credit_events')) {
      const row = db.prepare("SELECT COALESCE(SUM(CAST(amount AS INTEGER)), 0) as total FROM credit_events").get();
      totalCredited = BigInt(row?.total ?? 0);
    }
    if (tableExists(db, 'claim_events')) {
      const row = db.prepare("SELECT COALESCE(SUM(CAST(amount AS INTEGER)), 0) as total FROM claim_events").get();
      totalClaimed = BigInt(row?.total ?? 0);
    }

    const claimRate =
      totalCredited > 0n
        ? Math.round((Number(totalClaimed) / Number(totalCredited)) * 1000) / 10
        : 0;

    const data = {
      campaignId,
      as_of_ledger,
      summary: {
        totalParticipants,
        totalCredited: totalCredited.toString(),
        totalClaimed: totalClaimed.toString(),
        claimRate,
      },
    };

    const etag = `"${createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16)}"`;
    statsCache.set(cacheKey, { data, etag, at: now });
    // Prune old entries to cap memory
    if (statsCache.size > 200) {
      const oldest = [...statsCache.keys()][0];
      statsCache.delete(oldest);
    }

    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.set({ ETag: etag, 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' });
    return res.json(data);
  });

  return router;
}
