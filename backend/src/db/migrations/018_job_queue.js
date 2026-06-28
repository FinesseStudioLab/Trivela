export const version = 18;
export const description = 'Add job_queue table for durable job persistence (#565)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id            TEXT    PRIMARY KEY,
      type          TEXT    NOT NULL,
      payload       TEXT,
      status        TEXT    NOT NULL DEFAULT 'pending',
      attempts      INTEGER NOT NULL DEFAULT 0,
      max_attempts  INTEGER NOT NULL DEFAULT 5,
      base_delay_ms INTEGER NOT NULL DEFAULT 1000,
      max_delay_ms  INTEGER NOT NULL DEFAULT 30000,
      run_at        TEXT    NOT NULL,
      visible_at    TEXT    NOT NULL,
      enqueued_at   TEXT    NOT NULL,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_job_queue_type   ON job_queue(type);
    CREATE INDEX IF NOT EXISTS idx_job_queue_run_at ON job_queue(run_at);
    CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
  `);
}
