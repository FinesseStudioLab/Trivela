export const version = 31;
export const description = 'Add indexes for analytics rollup queries (#559)';

export function up(db) {
  // `analytics_events` is created by 009_analytics_events.sql. Databases
  // migrated before the runner understood .sql files never got that table, so
  // indexing it unconditionally would fail — skip instead, and let the next
  // run of 009 create the table with its own indexes.
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'analytics_events'")
    .get();
  if (!exists) return;

  db.exec(`
    -- Ensure created_at is indexed for time-range rollup queries
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
      ON analytics_events(created_at);

    -- Compound index for rollup aggregations
    CREATE INDEX IF NOT EXISTS idx_analytics_events_rollup
      ON analytics_events(event_name, campaign_id, created_at);
  `);
}
