// @ts-check
export const version = 17;
export const description = 'Add hash-chain columns to audit_logs for tamper-evidence (#581)';

export function up(db) {
  db.exec(`
    ALTER TABLE audit_logs ADD COLUMN seq        INTEGER;
    ALTER TABLE audit_logs ADD COLUMN prev_hash  TEXT;
    ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT;

    CREATE INDEX IF NOT EXISTS idx_audit_logs_seq ON audit_logs(seq);
  `);
}

export function down(db) {
  db.exec(`
    DROP INDEX IF EXISTS idx_audit_logs_seq;

    CREATE TABLE audit_logs_no_chain AS
      SELECT id, actor, action, entity, entity_id, diff, org_id, created_at
      FROM audit_logs;

    DROP TABLE audit_logs;

    ALTER TABLE audit_logs_no_chain RENAME TO audit_logs;

    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity     ON audit_logs(entity);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id     ON audit_logs(org_id);
  `);
}
