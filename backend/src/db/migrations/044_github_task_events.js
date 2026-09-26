export const version = 44;
export const description = 'Add github_task_events for verified developer-bounty tasks';

/**
 * Merged pull requests and closed issues reported by the GitHub webhook (#1256).
 * `delivery_id` is unique so GitHub redeliveries are idempotent.
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_task_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id   TEXT NOT NULL UNIQUE,
      kind          TEXT NOT NULL CHECK (kind IN ('pr_merged', 'issue_closed')),
      repo          TEXT NOT NULL,
      number        INTEGER NOT NULL,
      github_login  TEXT NOT NULL,
      url           TEXT,
      title         TEXT,
      occurred_at   TEXT,
      recorded_at   TEXT NOT NULL,
      UNIQUE (kind, repo, number, github_login)
    );
    CREATE INDEX IF NOT EXISTS idx_github_task_events_login
      ON github_task_events(github_login COLLATE NOCASE, id DESC);
  `);
}
