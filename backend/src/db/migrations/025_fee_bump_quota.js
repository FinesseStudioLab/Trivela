export const version = 25;
export const description = 'Fee-bump quota tracking for sponsored transactions (#555)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fee_bump_quota (
      id            TEXT PRIMARY KEY,
      wallet        TEXT NOT NULL,
      date          TEXT NOT NULL,
      count         INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      UNIQUE(wallet, date)
    );

    CREATE INDEX IF NOT EXISTS idx_fee_bump_quota_wallet_date ON fee_bump_quota(wallet, date);
  `);
}
