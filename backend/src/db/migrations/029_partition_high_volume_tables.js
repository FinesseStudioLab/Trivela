export const version = 29;
export const description =
  'Partition high-volume tables by campaign_id and add retention policies (#567)';

export function up(db) {
  const columnNames = (table) =>
    new Set(
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((col) => col.name),
    );

  // ALTER TABLE ADD COLUMN is not idempotent, so it is guarded rather than
  // relying on the migration only ever being applied once.
  if (!columnNames('indexed_events').has('campaign_id')) {
    db.exec('ALTER TABLE indexed_events ADD COLUMN campaign_id TEXT;');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_indexed_events_campaign ON indexed_events(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_indexed_events_campaign_ledger
      ON indexed_events(campaign_id, ledger);
  `);

  // audit_logs stores the campaign as (entity='campaign', entity_id) rather
  // than a dedicated campaign_id column — index the columns that exist.
  const auditColumns = columnNames('audit_logs');
  if (auditColumns.has('campaign_id')) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_campaign_created
        ON audit_logs(campaign_id, created_at) WHERE campaign_id IS NOT NULL;
    `);
  } else if (auditColumns.has('entity_id')) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
        ON audit_logs(entity, entity_id, created_at) WHERE entity_id IS NOT NULL;
    `);
  }

  db.exec(`
    -- Materialized view for analytics rollup (hourly aggregates)
    CREATE TABLE IF NOT EXISTS analytics_rollup_hourly (
      hour_bucket        TEXT NOT NULL,
      campaign_id        TEXT,
      event_type         TEXT NOT NULL,
      event_count        INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(hour_bucket, campaign_id, event_type)
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_rollup_hourly_campaign
      ON analytics_rollup_hourly(campaign_id, hour_bucket);

    -- Retention policy table for tracking partitions to delete
    CREATE TABLE IF NOT EXISTS partition_retention (
      partition_name     TEXT PRIMARY KEY,
      table_name         TEXT NOT NULL,
      created_at         TEXT NOT NULL,
      retention_days     INTEGER NOT NULL DEFAULT 90,
      marked_for_delete  TEXT
    );

    INSERT OR IGNORE INTO partition_retention (partition_name, table_name, created_at, retention_days)
    VALUES
      ('indexed_events', 'indexed_events', datetime('now'), 90),
      ('audit_logs', 'audit_logs', datetime('now'), 365);
  `);
}
