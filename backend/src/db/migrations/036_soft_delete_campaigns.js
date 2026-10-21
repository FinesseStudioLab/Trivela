export const version = 36;
export const description = 'Add deleted_at column to campaigns for soft-delete support';

export function up(db) {
  const columns = db.prepare('PRAGMA table_info(campaigns)').all();
  const columnNames = new Set(columns.map((col) => col.name));

  if (!columnNames.has('deleted_at')) {
    db.exec('ALTER TABLE campaigns ADD COLUMN deleted_at TEXT;');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_at ON campaigns(deleted_at);
  `);
}
