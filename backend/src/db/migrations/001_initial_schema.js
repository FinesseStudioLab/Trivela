export const version = 1;
export const description = 'Initial campaigns and audit_logs schema';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT    NOT NULL,
      slug              TEXT    NOT NULL UNIQUE,
      description       TEXT    NOT NULL DEFAULT '',
      active            INTEGER NOT NULL DEFAULT 1,
      featured          INTEGER NOT NULL DEFAULT 0,
      reward_per_action INTEGER NOT NULL DEFAULT 0,
      start_date        TEXT,
      end_date          TEXT,
      hidden            INTEGER NOT NULL DEFAULT 0,
      hidden_reason     TEXT,
      created_at        TEXT    NOT NULL,
      updated_at        TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_campaigns_slug       ON campaigns(slug);
    CREATE INDEX IF NOT EXISTS idx_campaigns_active     ON campaigns(active);
    CREATE INDEX IF NOT EXISTS idx_campaigns_hidden     ON campaigns(hidden);
    CREATE INDEX IF NOT EXISTS idx_campaigns_featured   ON campaigns(featured);
    CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
    CREATE INDEX IF NOT EXISTS idx_campaigns_name       ON campaigns(name);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id  INTEGER,
      action       TEXT NOT NULL,
      changed_by   TEXT,
      changed_at   TEXT NOT NULL,
      details      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_campaign_id ON audit_logs(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at  ON audit_logs(changed_at);
  `);
}
