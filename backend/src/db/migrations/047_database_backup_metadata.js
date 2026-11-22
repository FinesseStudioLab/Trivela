/**
 * Migration 047: Database Backup Metadata
 * Tracks database backups and recovery points for point-in-time recovery
 */

export const version = 47;
export const description = 'Database backup metadata and recovery tracking';

export function up(db) {
  // Backup metadata and recovery tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS database_backups (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      filename          TEXT UNIQUE NOT NULL,
      filepath          TEXT NOT NULL,
      backup_type       TEXT NOT NULL DEFAULT 'daily',
      size_bytes        INTEGER,
      created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      recovery_tested   BOOLEAN DEFAULT 0,
      recovery_tested_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_backups_created
      ON database_backups(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_backups_type
      ON database_backups(backup_type);
  `);

  // Recovery operations log
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_recovery_log (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_id         INTEGER NOT NULL REFERENCES database_backups(id),
      recovery_status   TEXT NOT NULL,
      recovered_from    TEXT,
      recovered_to      TEXT,
      error_message     TEXT,
      recovered_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      recovered_by      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_recovery_log_backup
      ON backup_recovery_log(backup_id);

    CREATE INDEX IF NOT EXISTS idx_recovery_log_status
      ON backup_recovery_log(recovery_status);
  `);
}
