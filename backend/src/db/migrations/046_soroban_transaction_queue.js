/**
 * Migration 046: Soroban Transaction Queue and Nonce Management
 * Tracks transaction submissions and nonce sequences for Soroban
 */

export const version = 46;
export const description = 'Soroban transaction queue and nonce management';

export function up(db) {
  // Transaction queue table for tracking pending/submitted transactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS soroban_transactions (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id        TEXT NOT NULL,
      transaction_hash  TEXT UNIQUE,
      nonce             INTEGER NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending',
      raw_tx            TEXT NOT NULL,
      submitted_at      TEXT,
      completed_at      TEXT,
      error_message     TEXT,
      created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_soroban_tx_account
      ON soroban_transactions(account_id);

    CREATE INDEX IF NOT EXISTS idx_soroban_tx_status
      ON soroban_transactions(status);

    CREATE INDEX IF NOT EXISTS idx_soroban_tx_nonce
      ON soroban_transactions(account_id, nonce);
  `);

  // Nonce state tracking per account
  db.exec(`
    CREATE TABLE IF NOT EXISTS soroban_nonce_state (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id        TEXT UNIQUE NOT NULL,
      current_nonce     INTEGER NOT NULL DEFAULT 0,
      last_updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_nonce_state_account
      ON soroban_nonce_state(account_id);
  `);
}
