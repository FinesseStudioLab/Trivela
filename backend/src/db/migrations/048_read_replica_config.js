/**
 * Migration 048: Read Replica Configuration
 * Tracks read replica instances and their health status for query routing
 */

export const version = 48;
export const description = 'Read replica configuration and health tracking';

export function up(db) {
  // Read replica configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS read_replica_config (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      replica_id        TEXT UNIQUE NOT NULL,
      host              TEXT NOT NULL,
      port              INTEGER NOT NULL,
      database          TEXT NOT NULL,
      is_active         BOOLEAN DEFAULT 1,
      weight            INTEGER DEFAULT 1,
      created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_replica_active
      ON read_replica_config(is_active);
  `);

  // Replica health check log
  db.exec(`
    CREATE TABLE IF NOT EXISTS replica_health_checks (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      replica_id        TEXT NOT NULL REFERENCES read_replica_config(replica_id),
      is_healthy        BOOLEAN NOT NULL,
      latency_ms        INTEGER,
      last_error        TEXT,
      checked_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_health_replica
      ON replica_health_checks(replica_id);

    CREATE INDEX IF NOT EXISTS idx_health_status
      ON replica_health_checks(is_healthy);

    CREATE INDEX IF NOT EXISTS idx_health_checked_at
      ON replica_health_checks(checked_at DESC);
  `);
}
