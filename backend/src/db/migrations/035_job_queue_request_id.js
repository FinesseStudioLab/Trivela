export const version = 35;
export const description =
  'Add request_id column to job_queue for correlation-ID propagation (#925)';

export function up(db) {
  db.exec(`
    ALTER TABLE job_queue ADD COLUMN request_id TEXT;
  `);
}
