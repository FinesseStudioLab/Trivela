export const version = 9;
export const description = 'Add status column to campaigns (draft/published/archived)';

export function up(db) {
  const columns = db.prepare('PRAGMA table_info(campaigns)').all();
  const columnNames = new Set(columns.map((col) => col.name));

  if (!columnNames.has('status')) {
    db.exec(
      "ALTER TABLE campaigns ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived'));",
    );
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
  `);
}
