export const version = 47;
export const description = 'Add tenant_id to campaigns for enterprise multi-tenant isolation';

export function up(db) {
  db.exec(`
    ALTER TABLE campaigns ADD COLUMN tenant_id TEXT;

    CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id
      ON campaigns(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id_active
      ON campaigns(tenant_id, active);
  `);
}
