export const version = 6;
export const description = 'Add api_keys table for database-backed API key management';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           TEXT    PRIMARY KEY,
      key_hash     TEXT    NOT NULL UNIQUE,
      label        TEXT    NOT NULL DEFAULT '',
      created_at   TEXT    NOT NULL,
      expires_at   TEXT,
      last_used_at TEXT,
      active       INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active   ON api_keys(active);
  `);
}
