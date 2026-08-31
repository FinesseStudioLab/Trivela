export const version = 30;
export const description = 'Add indexer gap detection and reconciliation table (#558)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_gaps (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id       TEXT NOT NULL,
      from_ledger       INTEGER NOT NULL,
      to_ledger         INTEGER NOT NULL,
      detected_at       TEXT NOT NULL DEFAULT (datetime('now')),
      reconciled_at     TEXT,
      UNIQUE(contract_id, from_ledger, to_ledger)
    );

    CREATE INDEX IF NOT EXISTS idx_indexer_gaps_unreconciled
      ON indexer_gaps(contract_id) WHERE reconciled_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_indexer_gaps_detected_at
      ON indexer_gaps(detected_at);
  `);
}
