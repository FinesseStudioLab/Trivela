export const version = 7;
export const description = 'Add failed_jobs dead-letter table for the job runner';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS failed_jobs (
      id            TEXT    PRIMARY KEY,
      type          TEXT    NOT NULL,
      payload       TEXT,
      error_message TEXT    NOT NULL,
      attempts      INTEGER NOT NULL,
      failed_at     TEXT    NOT NULL,
      enqueued_at   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_failed_jobs_failed_at ON failed_jobs(failed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_failed_jobs_type      ON failed_jobs(type);
  `);
}
