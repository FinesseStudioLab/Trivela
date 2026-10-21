// @ts-check
export const version = 52;
export const description =
  'Record the client IP on audit_logs and make the table append-only (#1318)';

/**
 * - `ip_address` stores the address the change came from (`req.ip`), next to the
 *   existing actor and timestamp. It is part of the hash chain when present.
 * - The triggers make `audit_logs` append-only at the database level: any
 *   UPDATE or DELETE aborts, so history cannot be rewritten through the app or
 *   an ad-hoc statement without first dropping the trigger deliberately.
 */
export function up(db) {
  db.exec(`
    ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;

    CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs is append-only');
    END;
  `);
}

export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS audit_logs_no_update;
    DROP TRIGGER IF EXISTS audit_logs_no_delete;
    ALTER TABLE audit_logs DROP COLUMN ip_address;
  `);
}
