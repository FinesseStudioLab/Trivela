export const version = 5;
export const description = 'Add FTS5 full-text search for campaigns';

export function up(db) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS campaigns_fts USING fts5(
      name,
      description,
      content='campaigns',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS campaigns_fts_ai AFTER INSERT ON campaigns BEGIN
      INSERT INTO campaigns_fts(rowid, name, description)
      VALUES (NEW.id, NEW.name, NEW.description);
    END;

    CREATE TRIGGER IF NOT EXISTS campaigns_fts_ad AFTER DELETE ON campaigns BEGIN
      INSERT INTO campaigns_fts(campaigns_fts, rowid, name, description)
      VALUES ('delete', OLD.id, OLD.name, OLD.description);
    END;

    CREATE TRIGGER IF NOT EXISTS campaigns_fts_au AFTER UPDATE ON campaigns BEGIN
      INSERT INTO campaigns_fts(campaigns_fts, rowid, name, description)
      VALUES ('delete', OLD.id, OLD.name, OLD.description);
      INSERT INTO campaigns_fts(rowid, name, description)
      VALUES (NEW.id, NEW.name, NEW.description);
    END;
  `);

  // Backfill existing campaigns into the FTS index
  db.exec(`
    INSERT INTO campaigns_fts(rowid, name, description)
    SELECT id, name, description FROM campaigns;
  `);
}
