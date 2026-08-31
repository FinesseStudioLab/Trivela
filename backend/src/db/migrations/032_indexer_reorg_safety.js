export const version = 32;
export const description =
  'Reorg-safe ingestion: confirmation depth, ledger hashes, reorg log (#981)';

export function up(db) {
  const columnNames = (table) =>
    new Set(
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((col) => col.name),
    );

  const eventColumns = columnNames('indexed_events');

  // Ingestion status. Existing rows predate confirmation tracking and have
  // already been projected, so they are backfilled as 'confirmed'.
  if (!eventColumns.has('status')) {
    db.exec(
      "ALTER TABLE indexed_events ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed' " +
        "CHECK(status IN ('tentative', 'confirmed', 'reverted'));",
    );
  }

  // Ledger hash the event was seen under — the signal a reorg has happened.
  if (!eventColumns.has('ledger_hash')) {
    db.exec('ALTER TABLE indexed_events ADD COLUMN ledger_hash TEXT;');
  }

  const stateColumns = columnNames('indexer_state');

  // Deepest ledger whose events are all confirmed. A reorg rewinds ingestion to
  // here rather than to the tip, so nothing from the dead fork is replayed.
  if (!stateColumns.has('safe_ledger')) {
    db.exec('ALTER TABLE indexer_state ADD COLUMN safe_ledger INTEGER NOT NULL DEFAULT 0;');
  }

  db.exec(`
    -- Promotion sweeps scan tentative rows in ledger order every poll.
    CREATE INDEX IF NOT EXISTS idx_indexed_events_status_ledger
      ON indexed_events(status, ledger);

    -- Reorg detection re-reads a slot by position, not by tx hash: a changed
    -- tx_hash at a known (ledger, event_index) means the ledger was replaced.
    CREATE INDEX IF NOT EXISTS idx_indexed_events_slot
      ON indexed_events(contract_id, ledger, event_index);

    -- One row per (contract, ledger). A second sighting of the same ledger
    -- under a different hash is a reorg.
    CREATE TABLE IF NOT EXISTS indexer_ledger_hashes (
      contract_id       TEXT NOT NULL,
      ledger            INTEGER NOT NULL,
      ledger_hash       TEXT NOT NULL,
      seen_at           TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (contract_id, ledger)
    );

    CREATE INDEX IF NOT EXISTS idx_indexer_ledger_hashes_ledger
      ON indexer_ledger_hashes(contract_id, ledger DESC);

    -- Audit trail. 'breached_confirmed' flags a reorg deeper than the
    -- configured confirmation depth: derived state may be wrong and an
    -- operator has to replay, so the indexer reports itself degraded.
    CREATE TABLE IF NOT EXISTS indexer_reorgs (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id        TEXT NOT NULL,
      fork_ledger        INTEGER NOT NULL,
      previous_hash      TEXT,
      new_hash           TEXT,
      depth              INTEGER NOT NULL DEFAULT 0,
      reverted_events    INTEGER NOT NULL DEFAULT 0,
      breached_confirmed INTEGER NOT NULL DEFAULT 0,
      detected_at        TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_indexer_reorgs_contract
      ON indexer_reorgs(contract_id, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_indexer_reorgs_unresolved
      ON indexer_reorgs(contract_id) WHERE resolved_at IS NULL;
  `);
}
