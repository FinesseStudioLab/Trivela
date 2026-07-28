export const version = 35;
export const description = 'Status page tables for incidents, maintenance, and subscriptions';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS status_incidents (
      id                TEXT PRIMARY KEY,
      title             TEXT    NOT NULL,
      description       TEXT    NOT NULL,
      components        TEXT    NOT NULL, -- JSON array of component IDs
      status            TEXT    NOT NULL CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
      impact            TEXT    NOT NULL CHECK(impact IN ('none', 'minor', 'major', 'critical')),
      created_at        TEXT    NOT NULL,
      updated_at        TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_status_incidents_status ON status_incidents(status);
    CREATE INDEX IF NOT EXISTS idx_status_incidents_created_at ON status_incidents(created_at);

    CREATE TABLE IF NOT EXISTS status_incident_updates (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id       TEXT    NOT NULL,
      status            TEXT    NOT NULL CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
      message           TEXT    NOT NULL,
      timestamp         TEXT    NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES status_incidents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_status_incident_updates_incident_id ON status_incident_updates(incident_id);

    CREATE TABLE IF NOT EXISTS status_maintenance (
      id                TEXT PRIMARY KEY,
      title             TEXT    NOT NULL,
      description       TEXT    NOT NULL,
      components        TEXT    NOT NULL, -- JSON array of component IDs
      scheduled_start   TEXT    NOT NULL,
      scheduled_end     TEXT    NOT NULL,
      created_at        TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_status_maintenance_scheduled_start ON status_maintenance(scheduled_start);
    CREATE INDEX IF NOT EXISTS idx_status_maintenance_scheduled_end ON status_maintenance(scheduled_end);

    CREATE TABLE IF NOT EXISTS status_subscribers (
      id                TEXT PRIMARY KEY,
      email             TEXT    NOT NULL UNIQUE,
      components        TEXT    NOT NULL, -- JSON array of component IDs to monitor
      created_at        TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_status_subscribers_email ON status_subscribers(email);
  `);
}

export function down(db) {
  db.exec(`
    DROP INDEX IF EXISTS idx_status_subscribers_email;
    DROP INDEX IF EXISTS idx_status_maintenance_scheduled_end;
    DROP INDEX IF EXISTS idx_status_maintenance_scheduled_start;
    DROP INDEX IF EXISTS idx_status_incident_updates_incident_id;
    DROP INDEX IF EXISTS idx_status_incidents_created_at;
    DROP INDEX IF EXISTS idx_status_incidents_status;

    DROP TABLE IF EXISTS status_subscribers;
    DROP TABLE IF EXISTS status_maintenance;
    DROP TABLE IF EXISTS status_incident_updates;
    DROP TABLE IF EXISTS status_incidents;
  `);
}
