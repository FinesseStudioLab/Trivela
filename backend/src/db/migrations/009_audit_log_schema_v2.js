export const version = 9;
export const description = 'Rebuild audit_logs with actor/entity/diff schema';

export function up(db) {
  db.exec(`
    ALTER TABLE audit_logs RENAME TO audit_logs_v1;

    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      actor      TEXT    NOT NULL,
      action     TEXT    NOT NULL,
      entity     TEXT    NOT NULL,
      entity_id  TEXT,
      diff       TEXT,
      created_at TEXT    NOT NULL
    );

    INSERT INTO audit_logs (id, actor, action, entity, entity_id, diff, created_at)
    SELECT
      id,
      COALESCE(changed_by, 'system'),
      action,
      'campaign',
      CAST(campaign_id AS TEXT),
      details,
      changed_at
    FROM audit_logs_v1;

    DROP TABLE audit_logs_v1;

    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity     ON audit_logs(entity);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  `);
}
