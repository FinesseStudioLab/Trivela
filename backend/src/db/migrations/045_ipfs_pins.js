export const version = 45;
export const description = 'Add ipfs_pins for campaign asset and metadata pinning';

/** Pins created by the IPFS pin service (#1255). `content_hash` de-duplicates identical content. */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ipfs_pins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id   TEXT NOT NULL,
      kind          TEXT NOT NULL CHECK (kind IN ('metadata', 'image', 'rules', 'badge')),
      content_hash  TEXT NOT NULL,
      cid           TEXT NOT NULL,
      name          TEXT,
      size_bytes    INTEGER,
      provider      TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      UNIQUE (campaign_id, kind, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_ipfs_pins_campaign ON ipfs_pins(campaign_id, id DESC);
  `);
}
