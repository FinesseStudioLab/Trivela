// @ts-check
import Database from 'better-sqlite3';

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
    hidden: row.hidden === 1,
    hiddenReason: row.hidden_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
  campaign.status = computeCampaignStatus(campaign);
  return campaign;
}

export function createSqliteCampaignRepository({
  db,
  seed = [],
}) {
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

  const SORTABLE_COLUMNS = new Set(['name', 'created_at', 'updated_at', 'reward_per_action', 'id']);

  /**
   * @param {{
   *   active?: boolean,
   *   q?: string,
   *   includeHidden?: boolean,
   *   sort?: string,
   *   order?: 'asc' | 'desc'
   * }} [opts]
   */
  function list({ active, q, includeHidden = false, sort, order } = {}) {
    const where = [];
    const params = [];

    if (!includeHidden) {
      where.push('hidden = 0');
    }

    if (active !== undefined) {
      where.push('active = ?');
      params.push(active ? 1 : 0);
    }

    if (typeof q === 'string' && q.length > 0) {
      const term = `%${q.toLowerCase()}%`;
      where.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)');
      params.push(term, term);
    }

    const sortCol = sort && SORTABLE_COLUMNS.has(sort) ? sort : 'id';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    // featured campaigns always surface first unless explicitly sorting by another column
    const orderClause = sort
      ? `ORDER BY ${sortCol} ${sortDir}`
      : `ORDER BY featured DESC, id ASC`;

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT * FROM campaigns ${whereClause} ${orderClause}`;
    return db.prepare(sql).all(...params).map(rowToCampaign);
  }

  function getById(id) {
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(id));
    return row ? rowToCampaign(row) : undefined;
  }

  function getBySlug(slug) {
    const row = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(slug);
    return row ? rowToCampaign(row) : undefined;
  }

  function create({ name, slug = undefined, description = '', active = true, rewardPerAction = 0, startDate = null, endDate = null, featured = false, hidden = false, hiddenReason = null }) {
    const createdAt = new Date().toISOString();
    const finalSlug = slug ?? generateSlug(name);
    const info = db
      .prepare(
        'INSERT INTO campaigns (name, slug, description, active, reward_per_action, start_date, end_date, featured, hidden, hidden_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(name, finalSlug, description, active ? 1 : 0, rewardPerAction, startDate, endDate, featured ? 1 : 0, hidden ? 1 : 0, hiddenReason, createdAt, createdAt);

    return getById(info.lastInsertRowid);
  }

  function update(id, fields) {
    const allowed = ['name', 'description', 'active', 'rewardPerAction', 'startDate', 'endDate', 'featured', 'hidden', 'hiddenReason'];
    const columnMap = {
      name: 'name',
      description: 'description',
      active: 'active',
      featured: 'featured',
      rewardPerAction: 'reward_per_action',
      startDate: 'start_date',
      endDate: 'end_date',
      hidden: 'hidden',
      hiddenReason: 'hidden_reason',
    };
    const booleanFields = new Set(['active', 'featured', 'hidden']);
    const sets = [];
    const values = [];

    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${columnMap[key]} = ?`);
        values.push(booleanFields.has(key) ? (fields[key] ? 1 : 0) : fields[key]);
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
