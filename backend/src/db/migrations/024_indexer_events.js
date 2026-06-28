export const version = 24;
export const description = 'Indexed events table and indexer state for production-grade event indexing (#532)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexed_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger            INTEGER NOT NULL,
      tx_hash           TEXT NOT NULL,
      contract_id       TEXT NOT NULL,
      event_type        TEXT NOT NULL,
      topic             TEXT NOT NULL,
      data_json         TEXT NOT NULL,
      event_index       INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tx_hash, event_index)
    );

    CREATE INDEX IF NOT EXISTS idx_indexed_events_ledger ON indexed_events(ledger);
    CREATE INDEX IF NOT EXISTS idx_indexed_events_type ON indexed_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_indexed_events_contract ON indexed_events(contract_id);

    CREATE TABLE IF NOT EXISTS indexer_state (
      contract_id       TEXT PRIMARY KEY,
      cursor            TEXT,
      last_ledger       INTEGER NOT NULL DEFAULT 0,
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
