export const version = 22;
export const description = 'Claimable balances table for unclaimed/expired rewards (#548)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS claimable_balances (
      id                TEXT PRIMARY KEY,
      campaign_id       TEXT NOT NULL,
      user_address      TEXT NOT NULL,
      asset_code        TEXT NOT NULL DEFAULT 'XLM',
      asset_issuer      TEXT,
      amount            TEXT NOT NULL,
      balance_id        TEXT UNIQUE,
      status            TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'created', 'claimed_by_user', 'reclaimed_by_operator', 'failed')),
      grace_end_at      TEXT NOT NULL,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL,
      error_message     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_claimable_balances_campaign ON claimable_balances(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_claimable_balances_user ON claimable_balances(user_address, status);
    CREATE INDEX IF NOT EXISTS idx_claimable_balances_grace ON claimable_balances(grace_end_at, status);
  `);
}
