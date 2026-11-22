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

export const DECAY_KINDS = ['linear', 'exponential'];

/**
 * Validate a decay policy object.
 * @param {unknown} policy
 * @returns {{ kind: string, rate_bps: number, period_ledgers: number, cliff_ledgers: number }}
 * @throws {Error} when the policy is structurally invalid
 */
export function validateDecayPolicy(policy) {
  if (policy === null || policy === undefined) {
    throw new Error('Decay policy must not be null; call clearDecayPolicy to remove it');
  }
  if (typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Decay policy must be an object');
  }

  const { kind, rate_bps, period_ledgers, cliff_ledgers } = policy;

  if (!DECAY_KINDS.includes(kind)) {
    throw new Error(`Decay policy kind must be one of: ${DECAY_KINDS.join(', ')}`);
  }
  if (!Number.isInteger(rate_bps) || rate_bps < 1 || rate_bps > 10_000) {
    throw new Error('Decay policy rate_bps must be an integer in 1–10 000');
  }
  if (!Number.isInteger(period_ledgers) || period_ledgers < 1) {
    throw new Error('Decay policy period_ledgers must be a positive integer');
  }
  if (!Number.isInteger(cliff_ledgers) || cliff_ledgers < 0) {
    throw new Error('Decay policy cliff_ledgers must be a non-negative integer');
  }

  return { kind, rate_bps, period_ledgers, cliff_ledgers };
}

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

function parseTranslationsFromRow(row) {
  try {
    const parsed = JSON.parse(row.translations ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseDecayPolicyFromRow(row) {
  if (!row.decay_policy) return null;
  try {
    const parsed = JSON.parse(row.decay_policy);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function rowToCampaign(row) {
  const rawTranslations = parseTranslationsFromRow(row);
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
    status: row.status ?? 'draft',
    decayPolicy: parseDecayPolicyFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    deletedAt: row.deleted_at ?? null,
    available_locales: Object.keys(rawTranslations),
    _rawTranslations: rawTranslations,
  };
  campaign.computedStatus = computeCampaignStatus(campaign);
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
      // `status` must be written explicitly: the column (migration 009)
      // defaults to 'draft', and list() only returns 'published' rows, so
      // omitting it seeded campaigns that nothing could ever list.
      const insert = db.prepare(
        'INSERT INTO campaigns (name, slug, description, active, featured, reward_per_action, start_date, end_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
            row.status ?? 'published',
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
   *   includeDeleted?: boolean,
   *   status?: 'draft' | 'published' | 'archived' | 'all',
   *   sort?: string,
   *   order?: 'asc' | 'desc'
   * }} [opts]
   */
  function list({
    active,
    q,
    tags,
    category,
    includeHidden = false,
    includeDeleted = false,
    status,
    sort,
    order,
  } = {}) {
    const where = [];
    const params = [];
    const hasQuery = typeof q === 'string' && q.length > 0;
    const useFts = hasQuery && ftsAvailable;

    if (!includeDeleted) {
      where.push('campaigns.deleted_at IS NULL');
    }

    if (!includeHidden) {
      where.push('campaigns.hidden = 0');
    }

    if (active !== undefined) {
      where.push('campaigns.active = ?');
      params.push(active ? 1 : 0);
    }

    if (status && status !== 'all') {
      where.push('campaigns.status = ?');
      params.push(status);
    } else if (!status) {
      where.push("campaigns.status = 'published'");
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
      WHERE category IS NOT NULL AND category != '' AND hidden = 0 AND deleted_at IS NULL
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
      WHERE campaigns.hidden = 0 AND campaigns.deleted_at IS NULL
      GROUP BY lower(json_each.value)
      ORDER BY count DESC, name ASC
      LIMIT ?
    `,
      )
      .all(limit);
  }

  function getById(id, { includeDeleted = false } = {}) {
    const where = includeDeleted ? 'id = ?' : 'id = ? AND deleted_at IS NULL';
    const row = db.prepare(`SELECT * FROM campaigns WHERE ${where}`).get(Number(id));
    return row ? rowToCampaign(row) : undefined;
  }

  function getBySlug(slug, { includeDeleted = false } = {}) {
    const where = includeDeleted ? 'slug = ?' : 'slug = ? AND deleted_at IS NULL';
    const row = db.prepare(`SELECT * FROM campaigns WHERE ${where}`).get(slug);
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
    status = 'draft',
    decayPolicy = null,
  }) {
    const normalizedTags = normalizeTags(tags);
    validateTags(normalizedTags);
    validateCategory(category, allowedCategories);

    let serializedDecayPolicy = null;
    if (decayPolicy !== null && decayPolicy !== undefined) {
      const validated = validateDecayPolicy(decayPolicy);
      serializedDecayPolicy = JSON.stringify(validated);
    }

    const createdAt = new Date().toISOString();
    const finalSlug = slug ?? generateSlug(name);
    const info = db
      .prepare(
        `INSERT INTO campaigns (
          name, slug, description, active, reward_per_action, referral_bonus_points,
          start_date, end_date, featured, hidden, hidden_reason, contract_id,
          image_url, tags, category, status, decay_policy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        status,
        serializedDecayPolicy,
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
      'status',
      'decayPolicy',
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
      status: 'status',
      decayPolicy: 'decay_policy',
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
      if (key === 'decayPolicy') {
        value = value === null || value === undefined ? null : JSON.stringify(validateDecayPolicy(value));
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
    const campaign = getById(id);
    if (!campaign) return false;
    const deletedAt = new Date().toISOString();
    const info = db
      .prepare(
        'UPDATE campaigns SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(deletedAt, deletedAt, Number(id));
    return info.changes > 0;
  }

  function restore(id) {
    const row = db
      .prepare('SELECT * FROM campaigns WHERE id = ? AND deleted_at IS NOT NULL')
      .get(Number(id));
    if (!row) return undefined;
    const updatedAt = new Date().toISOString();
    db.prepare('UPDATE campaigns SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(
      updatedAt,
      Number(id),
    );
    return getById(id);
  }

  function hardDelete(id) {
    const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(id));
    if (!row) return false;
    const info = db.prepare('DELETE FROM campaigns WHERE id = ?').run(Number(id));
    return info.changes > 0;
  }

  /**
   * @param {{ limit?: number, olderThanDays?: number }} [opts]
   */
  function listDeleted({ limit = 100, olderThanDays } = {}) {
    const where = ['deleted_at IS NOT NULL'];
    const params = [];
    if (olderThanDays) {
      where.push(`deleted_at < datetime('now', '-${olderThanDays} days')`);
    }
    return db
      .prepare(
        `SELECT * FROM campaigns WHERE ${where.join(' AND ')} ORDER BY deleted_at ASC LIMIT ?`,
      )
      .all(...params, limit)
      .map(rowToCampaign);
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

  /**
   * Publish a campaign (draft → published)
   * Validates required fields before publishing
   */
  function publish(id) {
    const deletedCampaign = db
      .prepare('SELECT * FROM campaigns WHERE id = ? AND deleted_at IS NOT NULL')
      .get(Number(id));
    if (deletedCampaign) {
      throw new Error('Cannot publish a deleted campaign');
    }

    const campaign = getById(id);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'published') {
      return campaign; // Already published, idempotent
    }

    if (campaign.status === 'archived') {
      throw new Error('Cannot publish an archived campaign. Only forward transitions are allowed.');
    }

    // Validate required fields for publishing
    if (!campaign.name || campaign.name.trim() === '') {
      throw new Error('Campaign name is required to publish');
    }

    if (!campaign.contractId) {
      throw new Error('Contract ID is required to publish');
    }

    const updatedAt = new Date().toISOString();
    db.prepare(`UPDATE campaigns SET status = 'published', updated_at = ? WHERE id = ?`).run(
      updatedAt,
      Number(id),
    );
    return getById(id);
  }

  /**
   * Archive a campaign (published → archived)
   * Can only archive published campaigns
   */
  function archive(id) {
    const deletedCampaign = db
      .prepare('SELECT * FROM campaigns WHERE id = ? AND deleted_at IS NOT NULL')
      .get(Number(id));
    if (deletedCampaign) {
      throw new Error('Cannot archive a deleted campaign');
    }

    const campaign = getById(id);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'archived') {
      return campaign; // Already archived, idempotent
    }

    if (campaign.status === 'draft') {
      throw new Error('Cannot archive a draft campaign. Publish it first.');
    }

    const updatedAt = new Date().toISOString();
    db.prepare(`UPDATE campaigns SET status = 'archived', updated_at = ? WHERE id = ?`).run(
      updatedAt,
      Number(id),
    );
    return getById(id);
  }

  // ── Decay policy CRUD ──────────────────────────────────────────────────────

  /**
   * Set (or replace) the decay policy for a campaign.
   *
   * @param {string | number} id
   * @param {{ kind: string, rate_bps: number, period_ledgers: number, cliff_ledgers: number }} policy
   */
  function setDecayPolicy(id, policy) {
    const validated = validateDecayPolicy(policy);
    const updatedAt = new Date().toISOString();
    const info = db
      .prepare('UPDATE campaigns SET decay_policy = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(JSON.stringify(validated), updatedAt, Number(id));
    if (info.changes === 0) {
      throw new Error(`Campaign ${id} not found or is deleted`);
    }
    return getById(id);
  }

  /**
   * Remove the decay policy from a campaign (sets column to NULL).
   *
   * @param {string | number} id
   */
  function clearDecayPolicy(id) {
    const updatedAt = new Date().toISOString();
    const info = db
      .prepare('UPDATE campaigns SET decay_policy = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(updatedAt, Number(id));
    if (info.changes === 0) {
      throw new Error(`Campaign ${id} not found or is deleted`);
    }
    return getById(id);
  }

  /**
   * Return the parsed decay policy for a campaign, or null if not set.
   *
   * @param {string | number} id
   */
  function getDecayPolicy(id) {
    const row = db.prepare('SELECT decay_policy FROM campaigns WHERE id = ? AND deleted_at IS NULL').get(Number(id));
    if (!row) return undefined;
    return parseDecayPolicyFromRow(row);
  }

  /** @param {string | number} id @returns {Record<string, { name?: string, description?: string }>} */
  function getTranslations(id) {
    const row = db.prepare('SELECT translations FROM campaigns WHERE id = ?').get(Number(id));
    if (!row) return {};
    return parseTranslationsFromRow(row);
  }

  /**
   * @param {string | number} id
   * @param {string} locale
   * @param {{ name?: string, description?: string }} data
   */
  function upsertTranslation(id, locale, data) {
    const current = getTranslations(id);
    const updated = { ...current, [locale]: { ...data } };
    const updatedAt = new Date().toISOString();
    db.prepare('UPDATE campaigns SET translations = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(updated),
      updatedAt,
      Number(id),
    );
  }

  /**
   * @param {string | number} id
   * @param {string} locale
   */
  function deleteTranslation(id, locale) {
    const current = getTranslations(id);
    if (!(locale in current)) return false;
    const { [locale]: _removed, ...rest } = current;
    const updatedAt = new Date().toISOString();
    db.prepare('UPDATE campaigns SET translations = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(rest),
      updatedAt,
      Number(id),
    );
    return true;
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
    restore,
    hardDelete,
    listDeleted,
    clone,
    publish,
    archive,
    getTranslations,
    upsertTranslation,
    deleteTranslation,
    setDecayPolicy,
    clearDecayPolicy,
    getDecayPolicy,
    ftsAvailable,
  };
}
