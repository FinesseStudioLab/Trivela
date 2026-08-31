export function createSqliteIdempotencyRepository({ db }) {
  const insertStmt = db.prepare(`
    INSERT INTO idempotency_keys (key, request_fingerprint, status_code, response_body, locked_at, completed_at, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+1 day'))
  `);

  const findStmt = db.prepare(`SELECT * FROM idempotency_keys WHERE key = ?`);

  const lockStmt = db.prepare(`
    UPDATE idempotency_keys SET locked_at = datetime('now') WHERE key = ? AND completed_at IS NULL AND locked_at IS NULL
  `);

  const completeStmt = db.prepare(`
    UPDATE idempotency_keys SET status_code = ?, response_body = ?, completed_at = datetime('now') WHERE key = ?
  `);

  const cleanupStmt = db.prepare(`DELETE FROM idempotency_keys WHERE expires_at < datetime('now')`);

  return {
    create(key, fingerprint) {
      insertStmt.run(key, fingerprint, 0, '{}', null, null);
      return findStmt.get(key);
    },

    find(key) {
      return findStmt.get(key) ?? null;
    },

    tryLock(key) {
      const result = lockStmt.run(key);
      return result.changes > 0;
    },

    complete(key, statusCode, responseBody) {
      completeStmt.run(statusCode, responseBody, key);
    },

    cleanup() {
      const result = cleanupStmt.run();
      return result.changes;
    },
  };
}
