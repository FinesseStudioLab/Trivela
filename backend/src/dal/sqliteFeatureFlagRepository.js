// @ts-check

/**
 * @param {{ id: number, flag_key: string, enabled: number, targeting: string, description: string|null, created_at: string, updated_at: string }} row
 */
function rowToFlag(row) {
  return {
    id: row.id,
    flagKey: row.flag_key,
    enabled: row.enabled === 1,
    targeting: JSON.parse(row.targeting || '{}'),
    description: row.description ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {{ db: import('better-sqlite3').Database }} deps
 */
export function createSqliteFeatureFlagRepository({ db }) {
  function upsert({ flagKey, enabled = false, targeting = {}, description = null }) {
    const now = new Date().toISOString();
    const targetingJson = JSON.stringify(targeting);
    const enabledInt = enabled ? 1 : 0;

    db.prepare(
      `INSERT INTO feature_flags (flag_key, enabled, targeting, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(flag_key) DO UPDATE SET
         enabled     = excluded.enabled,
         targeting   = excluded.targeting,
         description = excluded.description,
         updated_at  = excluded.updated_at`,
    ).run(flagKey, enabledInt, targetingJson, description, now, now);

    return rowToFlag(db.prepare('SELECT * FROM feature_flags WHERE flag_key = ?').get(flagKey));
  }

  function getByKey(flagKey) {
    const row = db.prepare('SELECT * FROM feature_flags WHERE flag_key = ?').get(flagKey);
    return row ? rowToFlag(row) : null;
  }

  function list() {
    return db.prepare('SELECT * FROM feature_flags ORDER BY flag_key').all().map(rowToFlag);
  }

  function remove(flagKey) {
    const result = db.prepare('DELETE FROM feature_flags WHERE flag_key = ?').run(flagKey);
    return result.changes > 0;
  }

  return { upsert, getByKey, list, remove };
}
