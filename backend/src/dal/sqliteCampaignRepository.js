// @ts-check
import Database from 'better-sqlite3';

/** @returns {boolean} */
export function isFts5Available(db) {
  try {
    db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_probe USING fts5(content);');
    db.exec('DROP TABLE IF EXISTS _fts5_probe;');
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_CATEGORIES = ['DeFi', 'NFT', 'Community', 'Airdrop'];

/**
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseCategoriesConfig(raw) {
  if (!raw) return DEFAULT_CATEGORIES;
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * @param {string[]} tags
 */
export function validateTags(tags) {
  for (const tag of tags) {
    if (tag.length > 32) {
      throw new Error(`Tag "${tag}" exceeds maximum length of 32 characters`);
    }
  }
}

/**
 * @param {string | null | undefined} category
 * @param {string[]} allowedCategories
 */
export function validateCategory(category, allowedCategories) {
  if (category == null || category === '') return;
  if (!allowedCategories.includes(category)) {
    throw new Error(`Category "${category}" is not in the allowed vocabulary`);
  }
}

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

function parseTagsFromRow(row) {
  try {
    const parsed = JSON.parse(row.tags ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    referralBonusPoints: row.referral_bonus_points ?? 0,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    hidden: row.hidden === 1,
    hiddenReason: row.hidden_reason ?? null,
    contractId: row.contract_id ?? null,
    imageUrl: row.image_url ?? null,
    tags: parseTagsFromRow(row),
    category: row.category ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
  campaign.status = computeCampaignStatus(campaign);
  return campaign;
}

export function createSqliteCampaignRepository({
  db,
  seed = [],
  allowedCategories = DEFAULT_CATEGORIES,
}) {
  const ftsAvailable = isFts5Available(db);

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
   *   tags?: string[],
   *   category?: string,
   *   includeHidden?: boolean,
   *   sort?: string,
   *   order?: 'asc' | 'desc'
   * }} [opts]
   */
  function list({ active, q, tags, category, includeHidden = false, sort, order } = {}) {
    const where = [];
    const params = [];
    const hasQuery = typeof q === 'string' && q.length > 0;
    const useFts = hasQuery && ftsAvailable;

    if (!includeHidden) {
      where.push('campaigns.hidden = 0');
    }

    if (active !== undefined) {
      where.push('campaigns.active = ?');
      params.push(active ? 1 : 0);
    }

    if (category) {
      where.push('campaigns.category = ?');
      params.push(category);
    }

    if (Array.isArray(tags) && tags.length > 0) {
      const tagClauses = tags.map(
        () =>
          `EXISTS (SELECT 1 FROM json_each(campaigns.tags) WHERE lower(json_each.value) = lower(?))`,
      );
      where.push(`(${tagClauses.join(' OR ')})`);
      params.push(...tags);
    }

    if (hasQuery) {
      if (useFts) {
        where.push('campaigns_fts MATCH ?');
        params.push(q);
      } else {
        const term = `%${q.toLowerCase()}%`;
        where.push('(LOWER(campaigns.name) LIKE ? OR LOWER(campaigns.description) LIKE ?)');
        params.push(term, term);
      }
    }

    const sortCol = sort && SORTABLE_COLUMNS.has(sort) ? sort : 'id';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    const orderClause =
      hasQuery && useFts
        ? `ORDER BY bm25(campaigns_fts) ASC, campaigns.featured DESC, campaigns.id ASC`
        : sort
          ? `ORDER BY campaigns.${sortCol} ${sortDir}`
          : `ORDER BY campaigns.featured DESC, campaigns.id ASC`;

    const fromClause = useFts
      ? 'FROM campaigns JOIN campaigns_fts ON campaigns.id = campaigns_fts.rowid'
      : 'FROM campaigns';

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT campaigns.* ${fromClause} ${whereClause} ${orderClause}`;
    return db
      .prepare(sql)
      .all(...params)
      .map(rowToCampaign);
  }

  function listCategories() {
    return db
      .prepare(
        `
      SELECT category AS name, COUNT(*) AS count
      FROM campaigns
      WHERE category IS NOT NULL AND category != '' AND hidden = 0
      GROUP BY category
      ORDER BY count DESC, category ASC
    `,
      )
      .all();
  }

  function listTags(limit = 50) {
    return db
      .prepare(
        `
      SELECT lower(json_each.value) AS name, COUNT(*) AS count
      FROM campaigns, json_each(campaigns.tags)
      WHERE campaigns.hidden = 0
      GROUP BY lower(json_each.value)
      ORDER BY count DESC, name ASC
      LIMIT ?
    `,
      )
      .all(limit);
  }

  function getById(id) {
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(id));
    return row ? rowToCampaign(row) : undefined;
  }

  function getBySlug(slug) {
    const row = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(slug);
    return row ? rowToCampaign(row) : undefined;
  }

  function create({
    name,
    slug = undefined,
    description = '',
    active = true,
    rewardPerAction = 0,
    referralBonusPoints = 0,
    startDate = null,
    endDate = null,
    featured = false,
    hidden = false,
    hiddenReason = null,
    contractId = null,
    imageUrl = null,
    tags = [],
    category = null,
  }) {
    const normalizedTags = normalizeTags(tags);
    validateTags(normalizedTags);
    validateCategory(category, allowedCategories);

    const createdAt = new Date().toISOString();
    const finalSlug = slug ?? generateSlug(name);
    const info = db
      .prepare(
        `INSERT INTO campaigns (
          name, slug, description, active, reward_per_action, referral_bonus_points,
          start_date, end_date, featured, hidden, hidden_reason, contract_id,
          image_url, tags, category, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name,
        finalSlug,
        description,
        active ? 1 : 0,
        rewardPerAction,
        referralBonusPoints,
        startDate,
        endDate,
        featured ? 1 : 0,
        hidden ? 1 : 0,
        hiddenReason,
        contractId,
        imageUrl,
        JSON.stringify(normalizedTags),
        category,
        createdAt,
        createdAt,
      );

    return getById(info.lastInsertRowid);
  }

  function update(id, fields) {
    const allowed = [
      'name',
      'description',
      'active',
      'rewardPerAction',
      'referralBonusPoints',
      'startDate',
      'endDate',
      'featured',
      'hidden',
      'hiddenReason',
      'contractId',
      'imageUrl',
      'tags',
      'category',
    ];
    const columnMap = {
      name: 'name',
      description: 'description',
      active: 'active',
      featured: 'featured',
      rewardPerAction: 'reward_per_action',
      referralBonusPoints: 'referral_bonus_points',
      startDate: 'start_date',
      endDate: 'end_date',
      hidden: 'hidden',
      hiddenReason: 'hidden_reason',
      contractId: 'contract_id',
      imageUrl: 'image_url',
      tags: 'tags',
      category: 'category',
    };
    const booleanFields = new Set(['active', 'featured', 'hidden']);
    const sets = [];
    const values = [];

    for (const key of allowed) {
      if (!(key in fields)) continue;

      let value = fields[key];
      if (key === 'tags') {
        value = JSON.stringify(normalizeTags(value));
        validateTags(normalizeTags(fields[key]));
      }
      if (key === 'category') {
        validateCategory(value, allowedCategories);
      }

      sets.push(`${columnMap[key]} = ?`);
      values.push(booleanFields.has(key) ? (value ? 1 : 0) : value);
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

  function clone(id, overrides = {}) {
    const source = getById(id);
    if (!source) {
      return undefined;
    }

    const clonedName = overrides.name !== undefined ? overrides.name : `Copy of ${source.name}`;
    const clonedSlug = overrides.slug !== undefined ? overrides.slug : generateSlug(clonedName);
    const clonedDescription =
      overrides.description !== undefined ? overrides.description : source.description;
    const clonedRewardPerAction =
      overrides.rewardPerAction !== undefined ? overrides.rewardPerAction : source.rewardPerAction;
    const clonedCategory =
      overrides.category !== undefined ? overrides.category : source.category || null;
    const clonedImageUrl =
      overrides.imageUrl !== undefined ? overrides.imageUrl : source.imageUrl || null;
    const clonedTags = overrides.tags !== undefined ? overrides.tags : source.tags || null;

    const createdAt = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO campaigns (name, slug, description, active, reward_per_action, start_date, end_date, featured, hidden, hidden_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        clonedName,
        clonedSlug,
        clonedDescription,
        0, // status: draft (active = false)
        clonedRewardPerAction,
        null, // startDate not copied
        null, // endDate not copied
        0, // featured = false
        source.hidden ? 1 : 0,
        source.hiddenReason,
        createdAt,
        createdAt,
      );

    const newCampaign = getById(info.lastInsertRowid);
    if (newCampaign) {
      newCampaign.clonedFrom = source.id;
    }
    return newCampaign;
  }

  return {
    list,
    listCategories,
    listTags,
    getById,
    getBySlug,
    create,
    update,
    delete: remove,
    clone,
    ftsAvailable,
  };
}
