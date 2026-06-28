export const version = 26;
export const description = 'Operator balance monitoring log (#552)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_balance_log (
      id            TEXT PRIMARY KEY,
      address       TEXT NOT NULL,
      balance_xlm   TEXT NOT NULL,
      threshold_xlm TEXT NOT NULL,
      below_threshold INTEGER NOT NULL DEFAULT 0,
      checked_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_op_balance_log_address ON operator_balance_log(address, checked_at);
  `);
}
