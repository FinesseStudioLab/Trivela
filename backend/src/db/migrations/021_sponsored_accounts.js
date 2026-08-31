export const version = 21;
export const description = 'Sponsorship tracking table for CAP-33 reserve sponsorship (#556)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sponsored_accounts (
      id              TEXT PRIMARY KEY,
      address         TEXT NOT NULL UNIQUE,
      account_type    TEXT NOT NULL DEFAULT 'stellar'
        CHECK (account_type IN ('stellar', 'smart_wallet')),
      sponsor_address TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'transferred')),
      trustline_asset TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      revoked_at      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sponsored_accounts_address ON sponsored_accounts(address);
    CREATE INDEX IF NOT EXISTS idx_sponsored_accounts_sponsor ON sponsored_accounts(sponsor_address, status);
  `);
}
