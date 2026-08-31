export const version = 14;
export const description = 'Add orgs and org_members tables for RBAC (#608)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_members (
      id          TEXT PRIMARY KEY,
      org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      api_key_id  TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'editor', 'viewer')),
      created_at  TEXT NOT NULL,
      UNIQUE(org_id, api_key_id)
    );

    CREATE INDEX IF NOT EXISTS idx_org_members_api_key_id ON org_members(api_key_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_org_id     ON org_members(org_id);
  `);
}
