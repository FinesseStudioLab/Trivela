export const version = 28;
export const description =
  'Add webhooks and webhook_deliveries tables for persistent webhook storage';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id          TEXT    PRIMARY KEY,
      url         TEXT    NOT NULL,
      secret      TEXT    NOT NULL,
      events      TEXT    NOT NULL DEFAULT '[]',
      active      INTEGER NOT NULL DEFAULT 1,
      description TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id            TEXT    PRIMARY KEY,
      webhook_id    TEXT    NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event         TEXT    NOT NULL,
      payload       TEXT,
      status_code   INTEGER NOT NULL DEFAULT 0,
      error         TEXT,
      attempts      INTEGER NOT NULL DEFAULT 1,
      next_retry_at TEXT,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id
      ON webhook_deliveries(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
      ON webhook_deliveries(next_retry_at)
      WHERE next_retry_at IS NOT NULL;
  `);
}

export function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS webhook_deliveries;
    DROP TABLE IF EXISTS webhooks;
  `);
}
