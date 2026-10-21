export const version = 43;
export const description = 'Add signup_events and fraud_flags for IP-cluster fraud detection';

/**
 * Only the /24 (IPv4) or /64 (IPv6) network prefix of a signup's IP is stored
 * (#1258), never the full address — except for known public proxy exit nodes,
 * whose address is a published list entry rather than personal data.
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signup_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      account     TEXT NOT NULL,
      ip_subnet   TEXT NOT NULL,
      proxy_exit  TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_signup_events_subnet
      ON signup_events(campaign_id, ip_subnet, created_at);
    CREATE INDEX IF NOT EXISTS idx_signup_events_proxy
      ON signup_events(campaign_id, proxy_exit, created_at);

    CREATE TABLE IF NOT EXISTS fraud_flags (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id    TEXT NOT NULL,
      rule           TEXT NOT NULL CHECK (rule IN ('ip_subnet_cluster', 'proxy_exit_node')),
      subject        TEXT NOT NULL,
      account_count  INTEGER NOT NULL,
      accounts       TEXT NOT NULL DEFAULT '[]',
      status         TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'dismissed', 'confirmed')),
      first_seen_at  TEXT NOT NULL,
      last_seen_at   TEXT NOT NULL,
      UNIQUE (campaign_id, rule, subject)
    );
    CREATE INDEX IF NOT EXISTS idx_fraud_flags_status
      ON fraud_flags(status, last_seen_at DESC);
  `);
}
