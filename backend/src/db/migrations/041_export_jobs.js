export const version = 41;
export const description = 'Add export_jobs table for asynchronous campaign export processing';

/**
 * Tracks campaign export requests that are processed off the request path by
 * the durable job queue (#1260). Status moves queued -> running -> completed,
 * or failed when the worker throws (the queue retries; a later attempt moves
 * the row back to running).
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_jobs (
      id           TEXT PRIMARY KEY,
      campaign_id  TEXT NOT NULL,
      format       TEXT NOT NULL CHECK (format IN ('csv', 'json')),
      from_date    TEXT,
      to_date      TEXT,
      status       TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'running', 'completed', 'failed')),
      row_count    INTEGER,
      file_url     TEXT,
      file_key     TEXT,
      error        TEXT,
      attempts     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      started_at   TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_export_jobs_campaign
      ON export_jobs(campaign_id, created_at DESC);
  `);
}
