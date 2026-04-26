import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  slug              TEXT    NOT NULL UNIQUE,
  description       TEXT    NOT NULL DEFAULT '',
  active            INTEGER NOT NULL DEFAULT 1,
  featured          INTEGER NOT NULL DEFAULT 0,
  reward_per_action INTEGER NOT NULL DEFAULT 0,
  start_date        TEXT,
  end_date          TEXT,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);
`;

/**
 * Status rules (deterministic, evaluated at read time):
 *   ended   — end_date is set and end_date <= now
 *   upcoming — start_date is set and start_date > now (and not ended)
 *   active  — everything else (within range or no date constraints)
 */
export function computeCampaignStatus({ startDate, endDate }) {
  const now = new Date();
  if (endDate && new Date(endDate) <= now) return 'ended';
  if (startDate && new Date(startDate) > now) return 'upcoming';
  return 'active';
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function rowToCampaign(row) {
  const campaign = {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
    active: row.active === 1,
    featured: row.featured === 1,
    rewardPerAction: row.reward_per_action,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
  campaign.status = computeCampaignStatus(campaign);
  return campaign;
}

export function createSqliteCampaignRepository({
  dbPath = ':memory:',
  seed = [],
} = {}) {
  const db = new Database(dbPath);
  db.exec(SCHEMA);

  const campaignColumns = db.prepare('PRAGMA table_info(campaigns)').all();
  const hasUpdatedAt = campaignColumns.some((column) => column.name === 'updated_at');
  if (!hasUpdatedAt) {
    db.exec('ALTER TABLE campaigns ADD COLUMN updated_at TEXT');
    db.exec('UPDATE campaigns SET updated_at = created_at WHERE updated_at IS NULL');
  }

  const hasFeatured = campaignColumns.some((column) => column.name === 'featured');
  if (!hasFeatured) {
    db.exec('ALTER TABLE campaigns ADD COLUMN featured INTEGER DEFAULT 0');
  }

  if (seed.length > 0) {
    const count = db.prepare('SELECT COUNT(*) AS n FROM campaigns').get().n;
    if (count === 0) {
      const insert = db.prepare(
        'INSERT INTO campaigns (name, slug, description, active, featured, reward_per_action, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          const createdAt = row.createdAt ?? new Date().toISOString();
          insert.run(
            row.name,
            row.slug ?? generateSlug(row.name),
            row.description ?? '',
            row.active ? 1 : 0,
            row.featured ? 1 : 0,
            row.rewardPerAction ?? 0,
            row.startDate ?? null,
            row.endDate ?? null,
            createdAt,
            row.updatedAt ?? createdAt,
          );
        }
      });
      insertMany(seed);
    }
  }

  function list({ active, q } = {}) {
    const hasQuery = typeof q === 'string' && q.length > 0;
    const queryTerm = hasQuery ? `%${q.toLowerCase()}%` : null;

    if (active !== undefined && hasQuery) {
      return db
        .prepare(
          'SELECT * FROM campaigns WHERE active = ? AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?) ORDER BY id ASC',
        )
        .all(active ? 1 : 0, queryTerm, queryTerm)
        .map(rowToCampaign);
    }

    if (hasQuery) {
      return db
        .prepare(
          'SELECT * FROM campaigns WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? ORDER BY id ASC',
        )
        .all(queryTerm, queryTerm)
        .map(rowToCampaign);
    }

    if (active !== undefined) {
      return db
        .prepare('SELECT * FROM campaigns WHERE active = ? ORDER BY id ASC')
        .all(active ? 1 : 0)
        .map(rowToCampaign);
    }

    return db
      .prepare('SELECT * FROM campaigns ORDER BY id ASC')
      .all()
      .map(rowToCampaign);
  }

  function getById(id) {
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(id));
    return row ? rowToCampaign(row) : undefined;
  }

  function getBySlug(slug) {
    const row = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(slug);
    return row ? rowToCampaign(row) : undefined;
  }

  function create({ name, slug, description = '', rewardPerAction = 0, startDate = null, endDate = null }) {
    const createdAt = new Date().toISOString();
    const finalSlug = slug ?? generateSlug(name);
    const info = db
      .prepare(
        'INSERT INTO campaigns (name, slug, description, active, featured, reward_per_action, start_date, end_date, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)',
      )
      .run(name, finalSlug, description, featured ? 1 : 0, rewardPerAction, startDate, endDate, createdAt);

    return getById(info.lastInsertRowid);
  }

  function update(id, fields) {
    const allowed = ['name', 'description', 'active', 'rewardPerAction', 'startDate', 'endDate'];
    const columnMap = {
      name: 'name',
      description: 'description',
      active: 'active',
      featured: 'featured',
      rewardPerAction: 'reward_per_action',
      startDate: 'start_date',
      endDate: 'end_date',
    };
    const sets = [];
    const values = [];

    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${columnMap[key]} = ?`);
        values.push(
          key === 'active' || key === 'featured'
            ? (fields[key] ? 1 : 0)
            : fields[key],
        );
      }
    }

    if (sets.length === 0) {
      return getById(id);
    }

    const updatedAt = new Date().toISOString();
    db.prepare(`UPDATE campaigns SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...values,
      updatedAt,
      Number(id),
    );
    return getById(id);
  }

  function remove(id) {
    const info = db.prepare('DELETE FROM campaigns WHERE id = ?').run(Number(id));
    return info.changes > 0;
  }

  return {
    list,
    getById,
    getBySlug,
    create,
    update,
    delete: remove,
  };
}
