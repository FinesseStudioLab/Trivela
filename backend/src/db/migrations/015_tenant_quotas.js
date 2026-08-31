// @ts-check
export const version = 15;
export const description = 'Add org_quotas and org_usage_log tables for tenant metering (#574)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_quotas (
      id             TEXT PRIMARY KEY,
      org_id         TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      resource       TEXT NOT NULL,
      soft_limit     INTEGER,
      hard_limit     INTEGER,
      window_seconds INTEGER NOT NULL DEFAULT 3600,
      updated_at     TEXT NOT NULL,
      UNIQUE(org_id, resource)
    );

    CREATE TABLE IF NOT EXISTS org_usage_log (
      id           TEXT PRIMARY KEY,
      org_id       TEXT NOT NULL,
      resource     TEXT NOT NULL,
      window_start TEXT NOT NULL,
      count        INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT NOT NULL,
      UNIQUE(org_id, resource, window_start)
    );

    CREATE INDEX IF NOT EXISTS idx_org_quotas_org_id        ON org_quotas(org_id);
    CREATE INDEX IF NOT EXISTS idx_org_usage_log_org_id     ON org_usage_log(org_id);
    CREATE INDEX IF NOT EXISTS idx_org_usage_log_window     ON org_usage_log(org_id, resource, window_start);
  `);
}

export function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS org_usage_log;
    DROP TABLE IF EXISTS org_quotas;
  `);
}
