export const version = 23;
export const description = 'Idempotency keys table for write endpoint deduplication (#533)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key               TEXT PRIMARY KEY,
      request_fingerprint TEXT NOT NULL,
      status_code       INTEGER NOT NULL,
      response_body     TEXT NOT NULL,
      locked_at         TEXT,
      completed_at      TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at        TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);
  `);
}
