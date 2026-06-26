export const version = 27;
export const description = 'Add translations JSON column to campaigns';

export function up(db) {
  const columns = db.prepare('PRAGMA table_info(campaigns)').all();
  const columnNames = new Set(columns.map((col) => col.name));

  if (!columnNames.has('translations')) {
    db.exec("ALTER TABLE campaigns ADD COLUMN translations TEXT NOT NULL DEFAULT '{}'");
  }
}

export function down(db) {
  // SQLite does not support DROP COLUMN in older versions; left as no-op.
  void db;
}
