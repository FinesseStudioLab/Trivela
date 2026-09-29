export const version = 49;
export const description = 'Add contract_tx_fees and gas_monitor_cursors for gas cost monitoring';

/**
 * Fees charged for submitted Soroban contract interactions (#1266).
 * `tx_hash` is unique so re-polled Horizon pages are idempotent. Fees are
 * stored as integer stroops (1 XLM = 10^7 stroops) to keep aggregates exact.
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_tx_fees (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash         TEXT NOT NULL UNIQUE,
      source_account  TEXT NOT NULL,
      fee_account     TEXT NOT NULL,
      contract_id     TEXT,
      function_name   TEXT,
      fee_charged     INTEGER NOT NULL,
      max_fee         INTEGER NOT NULL,
      fee_bump        INTEGER NOT NULL DEFAULT 0,
      successful      INTEGER NOT NULL DEFAULT 1,
      ledger          INTEGER,
      created_at      TEXT NOT NULL,
      recorded_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_contract_tx_fees_created
      ON contract_tx_fees(created_at);
    CREATE INDEX IF NOT EXISTS idx_contract_tx_fees_contract
      ON contract_tx_fees(contract_id, created_at);

    CREATE TABLE IF NOT EXISTS gas_monitor_cursors (
      account     TEXT PRIMARY KEY,
      cursor      TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);
}
