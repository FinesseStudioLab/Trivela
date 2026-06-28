// @ts-check
export const version = 16;
export const description = 'feature flags store';

/** @param {import('better-sqlite3').Database} db */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_key    TEXT NOT NULL UNIQUE,
      enabled     INTEGER NOT NULL DEFAULT 0,
      targeting   TEXT NOT NULL DEFAULT '{}',
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
