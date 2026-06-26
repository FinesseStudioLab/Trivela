export const version = 15;

/**
 * Migration 015: Add org_id to audit_logs for organization-scoped audit logging
 *
 * This migration adds org_id column to audit_logs table to enable
 * organization-scoped audit log queries and activity feeds.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    -- Add org_id column to audit_logs table
    ALTER TABLE audit_logs ADD COLUMN org_id TEXT;
    
    -- Create index for efficient org-scoped queries
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
    
    -- Create composite index for org + filters
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity ON audit_logs(org_id, entity);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action ON audit_logs(org_id, action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_at ON audit_logs(org_id, created_at);
  `);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.exec(`
    -- Drop the indexes first
    DROP INDEX IF EXISTS idx_audit_logs_org_created_at;
    DROP INDEX IF EXISTS idx_audit_logs_org_action;
    DROP INDEX IF EXISTS idx_audit_logs_org_entity;
    DROP INDEX IF EXISTS idx_audit_logs_org_id;
    
    -- Create a new table without org_id column
    CREATE TABLE audit_logs_backup AS SELECT id, actor, action, entity, entity_id, diff, created_at FROM audit_logs;
    
    -- Drop the original table
    DROP TABLE audit_logs;
    
    -- Recreate the table with original schema
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      diff TEXT,
      created_at TEXT NOT NULL
    );
    
    -- Restore data
    INSERT INTO audit_logs (id, actor, action, entity, entity_id, diff, created_at)
    SELECT id, actor, action, entity, entity_id, diff, created_at FROM audit_logs_backup;
    
    -- Drop backup table
    DROP TABLE audit_logs_backup;
    
    -- Recreate original indexes
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  `);
}
