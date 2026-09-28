export const migration = {
  name: '047_campaign_tenant_isolation',
  description: 'Add tenant_id to campaigns for enterprise multi-tenant isolation',
  up: (db) => {
    db.exec(`
      ALTER TABLE campaigns ADD COLUMN tenant_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id
        ON campaigns(tenant_id);

      CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_id_active
        ON campaigns(tenant_id, active);
    `);
  },
};
