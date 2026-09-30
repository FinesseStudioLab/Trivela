// @ts-check

const MAX_SLUG_LENGTH = 40;
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,50}$/;
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalize a Twitter/X handle ("@Some_Name") to its bare form, or null if invalid.
 * @param {unknown} handle
 * @returns {string|null}
 */
export function normalizeHandle(handle) {
  if (typeof handle !== 'string') return null;
  const bare = handle.trim().replace(/^@/, '');
  return HANDLE_PATTERN.test(bare) ? bare : null;
}

/**
 * URL-safe slug for a handle: lowercase, underscores to hyphens, trimmed.
 * @param {string} handle bare handle
 * @returns {string}
 */
export function slugifyHandle(handle) {
  return handle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * @param {unknown} code
 * @returns {boolean}
 */
export function isValidCode(code) {
  return typeof code === 'string' && code.length <= 60 && CODE_PATTERN.test(code);
}

/**
 * @param {{ db: InstanceType<import('better-sqlite3')> }} opts
 */
export function createInfluencerReferralRepository({ db }) {
  const toRecord = (/** @type {any} */ row) =>
    row && {
      id: String(row.id),
      code: row.code,
      influencerHandle: row.influencer_handle,
      campaignId: row.campaign_id == null ? null : String(row.campaign_id),
      active: row.active === 1,
      clickCount: row.click_count,
      createdAt: row.created_at,
    };

  function getByCode(/** @type {string} */ code) {
    return toRecord(
      db.prepare('SELECT * FROM influencer_referral_codes WHERE code = ?').get(code),
    );
  }

  function insert(/** @type {string} */ code, /** @type {string} */ handle, campaignId) {
    const info = db
      .prepare(
        `INSERT OR IGNORE INTO influencer_referral_codes
           (code, influencer_handle, campaign_id, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(code, handle, campaignId == null ? null : Number(campaignId), new Date().toISOString());
    return info.changes === 0 ? null : getByCode(code);
  }

  function listAll() {
    return db
      .prepare('SELECT * FROM influencer_referral_codes ORDER BY created_at ASC, id ASC')
      .all()
      .map(toRecord);
  }

  function setActive(/** @type {string} */ code, /** @type {boolean} */ active) {
    db.prepare('UPDATE influencer_referral_codes SET active = ? WHERE code = ?').run(
      active ? 1 : 0,
      code,
    );
    return getByCode(code);
  }

  function incrementClicks(/** @type {string} */ code) {
    db.prepare(
      'UPDATE influencer_referral_codes SET click_count = click_count + 1 WHERE code = ? AND active = 1',
    ).run(code);
  }

  return { getByCode, insert, listAll, setActive, incrementClicks };
}

export class InfluencerCodeError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} status
   */
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {{
 *   repository: ReturnType<typeof createInfluencerReferralRepository>,
 *   baseUrl?: string,
 * }} deps
 */
export function createInfluencerReferralService({ repository, baseUrl = 'https://trivela.network' }) {
  const origin = baseUrl.replace(/\/+$/, '');
  const withUrl = (/** @type {any} */ record) =>
    record && { ...record, referralUrl: `${origin}/ref/${record.code}` };

  /**
   * Generate a referral code from an influencer's handle. The first code for a
   * handle is the plain slug (`/ref/some-name`); further codes (e.g. per
   * campaign) get a numeric suffix so links never collide.
   * @param {{ handle: unknown, campaignId?: string|number|null }} input
   */
  function generate({ handle, campaignId = null }) {
    const bare = normalizeHandle(handle);
    if (!bare) {
      throw new InfluencerCodeError(
        'handle must be a Twitter/X handle of 1-50 letters, digits or underscores',
        'INVALID_HANDLE',
        400,
      );
    }
    const slug = slugifyHandle(bare);
    if (!slug) {
      throw new InfluencerCodeError('handle produces an empty code', 'INVALID_HANDLE', 400);
    }
    if (campaignId != null && !/^\d+$/.test(String(campaignId))) {
      throw new InfluencerCodeError('campaignId must be a positive integer', 'INVALID_CAMPAIGN', 400);
    }

    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const candidate = attempt === 1 ? slug : `${slug}-${attempt}`;
      const record = repository.insert(candidate, bare, campaignId);
      if (record) return withUrl(record);
    }
    throw new InfluencerCodeError('could not allocate a unique code', 'CODE_EXHAUSTED', 409);
  }

  function list() {
    return repository.listAll().map(withUrl);
  }

  /**
   * Resolve a public code, counting the click. Inactive/unknown codes are 404.
   * @param {unknown} code
   */
  function resolve(code) {
    if (!isValidCode(code)) return null;
    const record = repository.getByCode(/** @type {string} */ (code));
    if (!record || !record.active) return null;
    repository.incrementClicks(record.code);
    return withUrl({ ...record, clickCount: record.clickCount + 1 });
  }

  /**
   * @param {unknown} code
   * @param {boolean} active
   */
  function setActive(code, active) {
    if (!isValidCode(code) || !repository.getByCode(/** @type {string} */ (code))) {
      throw new InfluencerCodeError('referral code not found', 'CODE_NOT_FOUND', 404);
    }
    return withUrl(repository.setActive(/** @type {string} */ (code), active));
  }

  return { generate, list, resolve, setActive };
}
