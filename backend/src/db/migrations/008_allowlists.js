export const version = 8;
export const description = 'Add allowlists table for Merkle proofs';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS allowlists (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id      INTEGER NOT NULL,
      address         TEXT    NOT NULL,
      merkle_proof    TEXT    NOT NULL,
      merkle_root     TEXT    NOT NULL,
      label           TEXT,
      bonus_points    TEXT,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_allowlists_campaign_id ON allowlists(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_allowlists_address ON allowlists(address);

    -- A campaign can have one allowlist root; entries repeat the root value
    CREATE UNIQUE INDEX IF NOT EXISTS uq_allowlists_campaign_address ON allowlists(campaign_id, address);
  `);
}
