export const version = 27;
export const description =
  'Pruning state tracking for expired nonces, snapshots, and stale indices (#1029)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pruning_state (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_type     TEXT NOT NULL UNIQUE,
      last_pruned_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_cursor       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pruning_state_resource_type ON pruning_state(resource_type);
  `);
}
