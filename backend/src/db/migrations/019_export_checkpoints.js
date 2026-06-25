export const version = 19;
export const description = 'Add export_checkpoints table (#562)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS export_checkpoints (
      date         TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL
    );
  `);
}
