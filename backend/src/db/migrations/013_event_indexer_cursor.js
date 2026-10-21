export const version = 13;
export const description =
  'Add indexer_cursors and processed_events tables for exactly-once event processing (issue #753)';

export function up(db) {
  db.exec(`
    -- Stores the last successfully-processed event cursor per contract so the
    -- indexer can resume from exactly the right position after a restart,
    -- eliminating gaps and the need to replay from genesis.
    CREATE TABLE IF NOT EXISTS indexer_cursors (
      contract_id TEXT    PRIMARY KEY,
      cursor      TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    -- Per-event dedupe log keyed by (contract_id, ledger, event_index).
    -- INSERT OR IGNORE makes replaying the same ledger range a no-op, so
    -- restarting mid-batch never produces duplicate rows in other tables.
    CREATE TABLE IF NOT EXISTS processed_events (
      contract_id TEXT    NOT NULL,
      ledger      INTEGER NOT NULL,
      event_index INTEGER NOT NULL,
      processed_at INTEGER NOT NULL,
      PRIMARY KEY (contract_id, ledger, event_index)
    );

    CREATE INDEX IF NOT EXISTS idx_processed_events_ledger
      ON processed_events (contract_id, ledger);
  `);
}
