export const version = 42;
export const description = 'Add operator_deposits and horizon_watcher_cursors for deposit watching';

/**
 * Deposits observed by the Horizon account watcher (#1261). `paging_token` is
 * unique so replayed stream events (after a reconnect) are idempotent.
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_deposits (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      paging_token  TEXT NOT NULL UNIQUE,
      account       TEXT NOT NULL,
      from_address  TEXT,
      asset_code    TEXT NOT NULL,
      asset_issuer  TEXT,
      amount        TEXT NOT NULL,
      tx_hash       TEXT NOT NULL,
      verified      INTEGER NOT NULL DEFAULT 1,
      observed_at   TEXT NOT NULL,
      recorded_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_operator_deposits_account
      ON operator_deposits(account, id DESC);
    CREATE INDEX IF NOT EXISTS idx_operator_deposits_tx
      ON operator_deposits(tx_hash);

    CREATE TABLE IF NOT EXISTS horizon_watcher_cursors (
      account     TEXT PRIMARY KEY,
      cursor      TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);
}
