// @ts-check
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_SCOPES } from '../db/migrations/017_api_key_scopes.js';
import { DEFAULT_RATE_TIER } from '../config/rateTiers.js';

function hashKey(rawKey) {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateRawKey() {
  return `tk_${randomBytes(32).toString('base64url')}`;
}

function parseScopes(raw) {
  if (!raw) return DEFAULT_SCOPES;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_SCOPES;
  } catch {
    return DEFAULT_SCOPES;
  }
}

function rowToApiKey(row) {
  return {
    id: row.id,
    label: row.label,
    orgId: row.org_id ?? null,
    scopes: parseScopes(row.scopes),
    rateTier: row.rate_tier ?? DEFAULT_RATE_TIER,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
    lastUsedAt: row.last_used_at ?? null,
    active: row.active === 1,
  };
}

/**
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqliteApiKeyRepository({ db }) {
  const insertStmt = db.prepare(`
    INSERT INTO api_keys (id, key_hash, label, org_id, scopes, rate_tier, created_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const findByHashStmt = db.prepare(`
    SELECT * FROM api_keys WHERE key_hash = ? AND active = 1 LIMIT 1
  `);

  const touchStmt = db.prepare(`
    UPDATE api_keys SET last_used_at = ? WHERE id = ?
  `);

  const revokeStmt = db.prepare(`
    UPDATE api_keys SET active = 0 WHERE id = ?
  `);

  const setRateTierStmt = db.prepare(`
    UPDATE api_keys SET rate_tier = ? WHERE id = ?
  `);

  // Monthly usage counters (#759). `month` is 'YYYY-MM' in UTC, matching
  // currentMonthKey() below — an upsert so the first request of a new month
  // starts a fresh row rather than requiring a separate "create the month
  // bucket" step.
  const incrementUsageStmt = db.prepare(`
    INSERT INTO api_key_monthly_usage (api_key_id, month, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(api_key_id, month) DO UPDATE SET request_count = request_count + 1
  `);

  const getUsageStmt = db.prepare(`
    SELECT request_count FROM api_key_monthly_usage WHERE api_key_id = ? AND month = ?
  `);

  /**
   * @param {{ label?: string, expiresAt?: string | null, orgId?: string | null, scopes?: string[], rateTier?: string }} [opts]
   */
  function create({
    label = '',
    expiresAt = null,
    orgId = null,
    scopes = DEFAULT_SCOPES,
    rateTier = DEFAULT_RATE_TIER,
  } = {}) {
    const rawKey = generateRawKey();
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const scopesJson = JSON.stringify(scopes);

    insertStmt.run(id, hashKey(rawKey), label, orgId, scopesJson, rateTier, createdAt, expiresAt);

    return {
      key: rowToApiKey({
        id,
        label,
        org_id: orgId,
        scopes: scopesJson,
        rate_tier: rateTier,
        created_at: createdAt,
        expires_at: expiresAt,
        last_used_at: null,
        active: 1,
      }),
      rawKey,
    };
  }

  function list() {
    return db
      .prepare(
        `
      SELECT id, label, org_id, scopes, rate_tier, created_at, expires_at, last_used_at, active
      FROM api_keys
      ORDER BY created_at DESC
    `,
      )
      .all()
      .map(rowToApiKey);
  }

  function getById(id) {
    const row = db
      .prepare(
        `
      SELECT id, label, org_id, scopes, rate_tier, created_at, expires_at, last_used_at, active
      FROM api_keys WHERE id = ?
    `,
      )
      .get(id);
    return row ? rowToApiKey(row) : undefined;
  }

  function revoke(id) {
    const info = revokeStmt.run(id);
    return info.changes > 0;
  }

  /**
   * @param {string} rawKey
   * @returns {{ id: string, label: string, orgId: string | null, scopes: string[], rateTier: string } | null}
   */
  function validate(rawKey) {
    const row = findByHashStmt.get(hashKey(rawKey));
    if (!row) return null;

    if (row.expires_at && new Date(row.expires_at) <= new Date()) {
      return null;
    }

    return {
      id: row.id,
      label: row.label,
      orgId: row.org_id ?? null,
      scopes: parseScopes(row.scopes),
      rateTier: row.rate_tier ?? DEFAULT_RATE_TIER,
    };
  }

  function touchLastUsed(id) {
    touchStmt.run(new Date().toISOString(), id);
  }

  function rotate(id) {
    const existing = getById(id);
    if (!existing || !existing.active) {
      return null;
    }

    revoke(id);
    return create({
      label: existing.label,
      expiresAt: existing.expiresAt,
      orgId: existing.orgId,
      scopes: existing.scopes,
      rateTier: existing.rateTier,
    });
  }

  /**
   * Update the rate tier of an existing key in place (#924) — lets an admin
   * upgrade/downgrade a partner's limits without rotating (and invalidating)
   * their credential.
   *
   * @param {string} id
   * @param {string} rateTier
   */
  function setRateTier(id, rateTier) {
    const info = setRateTierStmt.run(rateTier, id);
    return info.changes > 0 ? getById(id) : null;
  }

  function hasActiveKeys() {
    const row = db.prepare('SELECT 1 AS n FROM api_keys WHERE active = 1 LIMIT 1').get();
    return Boolean(row);
  }

  /**
   * 'YYYY-MM' in UTC — the current calendar-month usage bucket.
   * @param {Date} [now]
   */
  function currentMonthKey(now = new Date()) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Increment this key's request count for the current UTC month and
   * return the new total. Called once per accepted (non-rate-limited)
   * request (#759).
   * @param {string} id
   * @param {Date} [now]
   */
  function incrementMonthlyUsage(id, now = new Date()) {
    const month = currentMonthKey(now);
    incrementUsageStmt.run(id, month);
    return getUsageStmt.get(id, month)?.request_count ?? 0;
  }

  /**
   * Current UTC-month usage count for a key, without incrementing it.
   * @param {string} id
   * @param {Date} [now]
   */
  function getMonthlyUsage(id, now = new Date()) {
    const month = currentMonthKey(now);
    return getUsageStmt.get(id, month)?.request_count ?? 0;
  }

  return {
    create,
    list,
    getById,
    revoke,
    validate,
    touchLastUsed,
    rotate,
    hasActiveKeys,
    setRateTier,
    incrementMonthlyUsage,
    getMonthlyUsage,
  };
}

export { hashKey, generateRawKey };
