export const version = 4;
export const description = 'Add image_url, tags, and category columns to campaigns';

export function up(db) {
  const columns = db.prepare('PRAGMA table_info(campaigns)').all();
  const columnNames = new Set(columns.map((col) => col.name));

  if (!columnNames.has('image_url')) {
    db.exec('ALTER TABLE campaigns ADD COLUMN image_url TEXT;');
  }
  if (!columnNames.has('tags')) {
    db.exec("ALTER TABLE campaigns ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';");
  }
  if (!columnNames.has('category')) {
    db.exec('ALTER TABLE campaigns ADD COLUMN category TEXT;');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_category ON campaigns(category);
  `);
}
