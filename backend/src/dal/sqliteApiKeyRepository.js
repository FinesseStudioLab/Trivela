// @ts-check
import { createHash, randomBytes, randomUUID } from 'node:crypto';

function hashKey(rawKey) {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateRawKey() {
  return `tk_${randomBytes(32).toString('base64url')}`;
}

function rowToApiKey(row) {
  return {
    id: row.id,
    label: row.label,
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
    INSERT INTO api_keys (id, key_hash, label, created_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, 1)
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

  /**
   * @param {{ label?: string, expiresAt?: string | null }} [opts]
   */
  function create({ label = '', expiresAt = null } = {}) {
    const rawKey = generateRawKey();
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    insertStmt.run(id, hashKey(rawKey), label, createdAt, expiresAt);

    return {
      key: rowToApiKey({
        id,
        label,
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
      SELECT id, label, created_at, expires_at, last_used_at, active
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
      SELECT id, label, created_at, expires_at, last_used_at, active
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
   * @returns {{ id: string, label: string } | null}
   */
  function validate(rawKey) {
    const row = findByHashStmt.get(hashKey(rawKey));
    if (!row) return null;

    if (row.expires_at && new Date(row.expires_at) <= new Date()) {
      return null;
    }

    return { id: row.id, label: row.label };
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
    return create({ label: existing.label, expiresAt: existing.expiresAt });
  }

  function hasActiveKeys() {
    const row = db.prepare('SELECT 1 AS n FROM api_keys WHERE active = 1 LIMIT 1').get();
    return Boolean(row);
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
  };
}

export { hashKey, generateRawKey };
