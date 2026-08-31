export const version = 20;
export const description = 'Add indexer_checkpoints table (#561)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_checkpoints (
      key               TEXT PRIMARY KEY,
      cursor            TEXT NOT NULL,
      ledger            INTEGER,
      events_processed  INTEGER DEFAULT 0,
      updated_at        TEXT    NOT NULL
    );
  `);
}
