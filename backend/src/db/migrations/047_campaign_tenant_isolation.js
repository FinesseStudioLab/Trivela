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

// The migration runner reads `version`/`description`/`up` as named exports.
// Versions 46-48 are already taken by the other migrations that share those
// file numbers, so these use the next free numbers.
export const version = 50;
export const description = migration.description;
export const up = migration.up;
