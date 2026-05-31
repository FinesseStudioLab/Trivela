// @ts-check
//
// PostgreSQL-backed campaign repository (issue #284).
//
// Implements the same interface as `sqliteCampaignRepository.js` so the
// DAL factory can swap based on `DATABASE_URL`. Reused helpers
// (`computeCampaignStatus`, `parseCategoriesConfig`, `validateTags`,
// `validateCategory`, `normalizeTags`) live in the SQLite module since they
// are SQL-engine agnostic.

import {
  DEFAULT_CATEGORIES,
  computeCampaignStatus,
  normalizeTags,
  validateCategory,
  validateTags,
} from '../sqliteCampaignRepository.js';

const SORTABLE_COLUMNS = new Set([
  'name',
  'created_at',
  'updated_at',
  'reward_per_action',
  'id',
]);

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
    active: row.active === true || row.active === 1,
    featured: row.featured === true || row.featured === 1,
    rewardPerAction: row.reward_per_action,
    referralBonusPoints: row.referral_bonus_points ?? 0,
    startDate: row.start_date ? new Date(row.start_date).toISOString() : null,
    endDate: row.end_date ? new Date(row.end_date).toISOString() : null,
    hidden: row.hidden === true || row.hidden === 1,
    hiddenReason: row.hidden_reason ?? null,
    contractId: row.contract_id ?? null,
    imageUrl: row.image_url ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    category: row.category ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : new Date(row.created_at).toISOString(),
  };
  campaign.status = computeCampaignStatus(campaign);
  return campaign;
}

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   seed?: Array<Record<string, any>>,
 *   allowedCategories?: string[],
 * }} opts
 */
export function createPgCampaignRepository({
  pool,
  seed = [],
  allowedCategories = DEFAULT_CATEGORIES,
}) {
  async function maybeSeed() {
    if (seed.length === 0) return;
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM campaigns');
    if (rows[0].n !== 0) return;
    const insert = `
      INSERT INTO campaigns (
        name, slug, description, active, featured, reward_per_action,
        start_date, end_date, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    for (const row of seed) {
      const createdAt = row.createdAt ?? new Date().toISOString();
      await pool.query(insert, [
        row.name,
        row.slug ?? generateSlug(row.name),
        row.description ?? '',
        Boolean(row.active),
        Boolean(row.featured),
        row.rewardPerAction ?? 0,
        row.startDate ?? null,
        row.endDate ?? null,
        createdAt,
        row.updatedAt ?? createdAt,
      ]);
    }
  }

  const seedPromise = maybeSeed();

  async function list({
    active,
    q,
    tags,
    category,
    includeHidden = false,
    sort,
    order,
  } = {}) {
    await seedPromise;

    const where = [];
    const params = [];
    let idx = 1;

    if (!includeHidden) where.push('campaigns.hidden = FALSE');
    if (active !== undefined) {
      where.push(`campaigns.active = $${idx++}`);
      params.push(Boolean(active));
    }
    if (category) {
      where.push(`campaigns.category = $${idx++}`);
      params.push(category);
    }
    if (Array.isArray(tags) && tags.length > 0) {
      // Case-insensitive tag match using JSONB `?|` operator on the lowercased
      // tags array. We stash the lowercased input in the params array.
      where.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(campaigns.tags) AS t WHERE LOWER(t) = ANY($${idx++}))`,
      );
      params.push(tags.map((t) => String(t).toLowerCase()));
    }
    if (typeof q === 'string' && q.length > 0) {
      where.push(
        `(LOWER(campaigns.name) LIKE $${idx} OR LOWER(campaigns.description) LIKE $${idx})`,
      );
      params.push(`%${q.toLowerCase()}%`);
      idx += 1;
    }

    const sortCol = sort && SORTABLE_COLUMNS.has(sort) ? sort : 'id';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
    const orderClause = sort
      ? `ORDER BY campaigns.${sortCol} ${sortDir}`
      : `ORDER BY campaigns.featured DESC, campaigns.id ASC`;
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `SELECT * FROM campaigns ${whereClause} ${orderClause}`;
    const { rows } = await pool.query(sql, params);
    return rows.map(rowToCampaign);
  }

  async function listCategories() {
    const { rows } = await pool.query(`
      SELECT category AS name, COUNT(*)::int AS count
      FROM campaigns
      WHERE category IS NOT NULL AND category != '' AND hidden = FALSE
      GROUP BY category
      ORDER BY count DESC, category ASC
    `);
    return rows;
  }

  async function listTags(limit = 50) {
    const { rows } = await pool.query(
      `
        SELECT LOWER(t)::text AS name, COUNT(*)::int AS count
        FROM campaigns, jsonb_array_elements_text(campaigns.tags) AS t
        WHERE campaigns.hidden = FALSE
        GROUP BY LOWER(t)
        ORDER BY count DESC, name ASC
        LIMIT $1
      `,
      [limit],
    );
    return rows;
  }

  async function getById(id) {
    await seedPromise;
    const { rows } = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1',
      [Number(id)],
    );
    return rows[0] ? rowToCampaign(rows[0]) : undefined;
  }

  async function getBySlug(slug) {
    await seedPromise;
    const { rows } = await pool.query(
      'SELECT * FROM campaigns WHERE slug = $1',
      [slug],
    );
    return rows[0] ? rowToCampaign(rows[0]) : undefined;
  }

  async function create({
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
    await seedPromise;

    const normalizedTags = normalizeTags(tags);
    validateTags(normalizedTags);
    validateCategory(category, allowedCategories);

    const createdAt = new Date().toISOString();
    const finalSlug = slug ?? generateSlug(name);

    const { rows } = await pool.query(
      `
        INSERT INTO campaigns (
          name, slug, description, active, reward_per_action, referral_bonus_points,
          start_date, end_date, featured, hidden, hidden_reason, contract_id,
          image_url, tags, category, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14::jsonb, $15, $16, $16
        )
        RETURNING *
      `,
      [
        name,
        finalSlug,
        description,
        Boolean(active),
        rewardPerAction,
        referralBonusPoints,
        startDate,
        endDate,
        Boolean(featured),
        Boolean(hidden),
        hiddenReason,
        contractId,
        imageUrl,
        JSON.stringify(normalizedTags),
        category,
        createdAt,
      ],
    );
    return rowToCampaign(rows[0]);
  }

  async function update(id, fields) {
    await seedPromise;

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
    const params = [];
    let idx = 1;

    for (const key of Object.keys(columnMap)) {
      if (!(key in fields)) continue;
      let value = fields[key];
      if (key === 'tags') {
        validateTags(normalizeTags(value));
        value = JSON.stringify(normalizeTags(value));
        sets.push(`${columnMap[key]} = $${idx++}::jsonb`);
        params.push(value);
        continue;
      }
      if (key === 'category') {
        validateCategory(value, allowedCategories);
      }
      sets.push(`${columnMap[key]} = $${idx++}`);
      params.push(booleanFields.has(key) ? Boolean(value) : value);
    }

    if (sets.length === 0) return getById(id);

    sets.push(`updated_at = $${idx++}`);
    params.push(new Date().toISOString());
    params.push(Number(id));

    await pool.query(
      `UPDATE campaigns SET ${sets.join(', ')} WHERE id = $${idx}`,
      params,
    );
    return getById(id);
  }

  async function remove(id) {
    const result = await pool.query(
      'DELETE FROM campaigns WHERE id = $1',
      [Number(id)],
    );
    return result.rowCount > 0;
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
    /** Always false — PG path uses LIKE rather than SQLite FTS5. */
    ftsAvailable: false,
  };
}
