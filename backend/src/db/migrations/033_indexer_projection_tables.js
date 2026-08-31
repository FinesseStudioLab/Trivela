export const version = 33;
export const description = 'Derived-state tables written by the indexer projection handlers (#981)';

/**
 * The projection handlers in jobs/eventIndexer.js have always written to these
 * tables, but nothing ever created them in the SQLite schema — every projection
 * failed and was swallowed as an indexer error. Confirmation-depth rollback is
 * only meaningful if the derived state it protects actually exists, so the
 * schema lands alongside it.
 *
 * Column names and types mirror the handler statements exactly.
 */
export function up(db) {
  db.exec(`
    -- credit / claim → running per-user point balance
    CREATE TABLE IF NOT EXISTS balances (
      user       TEXT    PRIMARY KEY,
      balance    INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS credit_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user       TEXT    NOT NULL,
      amount     TEXT    NOT NULL,
      ledger     INTEGER,
      tx_hash    TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_credit_events_user ON credit_events(user);
    CREATE INDEX IF NOT EXISTS idx_credit_events_ledger ON credit_events(ledger);

    CREATE TABLE IF NOT EXISTS claim_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user       TEXT    NOT NULL,
      amount     TEXT    NOT NULL,
      ledger     INTEGER,
      tx_hash    TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_claim_events_user ON claim_events(user);
    CREATE INDEX IF NOT EXISTS idx_claim_events_ledger ON claim_events(ledger);

    -- snapshot → ledger a snapshot id was taken at
    CREATE TABLE IF NOT EXISTS snapshots (
      snapshot_id   TEXT PRIMARY KEY,
      ledger_number TEXT NOT NULL,
      recorded_at   INTEGER NOT NULL
    );

    -- vcredit / vclaim → vesting schedules and their claims
    CREATE TABLE IF NOT EXISTS vesting_schedules (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user    TEXT    NOT NULL,
      vest_id TEXT    NOT NULL,
      total   TEXT    NOT NULL,
      ledger  INTEGER,
      tx_hash TEXT,
      UNIQUE(user, vest_id)
    );

    CREATE TABLE IF NOT EXISTS vested_claim_events (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user    TEXT    NOT NULL,
      vest_id TEXT    NOT NULL,
      amount  TEXT    NOT NULL,
      ledger  INTEGER,
      tx_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vested_claim_events_user ON vested_claim_events(user, vest_id);

    -- referred → the referral edge (one referrer per referee)
    CREATE TABLE IF NOT EXISTS referral_credits (
      referee  TEXT PRIMARY KEY,
      referrer TEXT NOT NULL,
      ledger   INTEGER,
      tx_hash  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_referral_credits_referrer ON referral_credits(referrer);

    -- register / deregister → campaign participation
    CREATE TABLE IF NOT EXISTS participants (
      user          TEXT    NOT NULL,
      campaign_id   TEXT    NOT NULL,
      registered_at INTEGER,
      tx_hash       TEXT,
      PRIMARY KEY (user, campaign_id)
    );
    CREATE INDEX IF NOT EXISTS idx_participants_campaign ON participants(campaign_id);
  `);
}
