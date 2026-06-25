export const version = 17;
export const description = 'Add org_id and scopes columns to api_keys for org-scoped granular access (#611)';

/**
 * Canonical scope set. New keys are created with an explicit scopes list; legacy
 * keys (created before this migration) are backfilled with the full default set so
 * they keep working without any action from operators.
 */
export const DEFAULT_SCOPES = ['campaigns:read', 'campaigns:write', 'allowlist:write', 'admin'];

export function up(db) {
  db.exec(`
    ALTER TABLE api_keys ADD COLUMN org_id TEXT;
    ALTER TABLE api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT '${JSON.stringify(DEFAULT_SCOPES)}';

    CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id);
  `);

  // Backfill: existing rows already have the DEFAULT applied by SQLite for the
  // scopes column; org_id stays NULL (legacy keys are not org-scoped).
}
