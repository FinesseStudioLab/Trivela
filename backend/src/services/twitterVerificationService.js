/**
 * Twitter/X social task verification (#1243).
 *
 * Confirms a user actually performed a social task — posted a tweet, liked a
 * tweet, retweeted a tweet, or followed an account — by querying the official
 * Twitter API v2 before any points are awarded. Nothing here trusts the
 * client: the caller supplies only the user's X handle and the task, and every
 * claim is checked against the API.
 *
 * Endpoints used (app-only bearer token, `TWITTER_BEARER_TOKEN`):
 *   GET /2/users/by/username/:username   resolve handle -> user id
 *   GET /2/users/:id/tweets              recent tweets (tweet task)
 *   GET /2/tweets/:id/liking_users       like task
 *   GET /2/tweets/:id/retweeted_by       retweet task
 *   GET /2/users/:id/following           follow task
 *
 * List endpoints are paginated; `maxPages` bounds how many pages a single
 * verification may read so one request can't burn the app's rate limit.
 */

export const TWITTER_API_BASE_URL = 'https://api.twitter.com';
export const SOCIAL_TASK_TYPES = Object.freeze(['tweet', 'like', 'retweet', 'follow']);

const USERNAME_RE = /^[A-Za-z0-9_]{1,15}$/;
const TWEET_ID_RE = /^\d{1,19}$/;
const MAX_TWEET_TEXT_LENGTH = 280;

/** Base class so routes can map every verification failure to one shape. */
export class SocialVerificationError extends Error {
  /**
   * @param {string} message
   * @param {{ code: string, status: number, retryAfterSeconds?: number }} info
   */
  constructor(message, { code, status, retryAfterSeconds }) {
    super(message);
    this.name = 'SocialVerificationError';
    this.code = code;
    this.status = status;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Validate and normalise a task definition.
 * @param {unknown} task
 * @returns {{ type: 'tweet', text: string } | { type: 'like' | 'retweet', tweetId: string } | { type: 'follow', targetUsername: string }}
 */
export function parseSocialTask(task) {
  const invalid = (message) =>
    new SocialVerificationError(message, { code: 'INVALID_TASK', status: 400 });

  if (!task || typeof task !== 'object') throw invalid('task must be an object');
  const { type } = /** @type {Record<string, unknown>} */ (task);
  if (!SOCIAL_TASK_TYPES.includes(/** @type {string} */ (type))) {
    throw invalid(`task.type must be one of: ${SOCIAL_TASK_TYPES.join(', ')}`);
  }

  const t = /** @type {Record<string, unknown>} */ (task);
  if (type === 'tweet') {
    const text = typeof t.text === 'string' ? t.text.trim() : '';
    if (!text || text.length > MAX_TWEET_TEXT_LENGTH) {
      throw invalid(`task.text must be 1-${MAX_TWEET_TEXT_LENGTH} characters`);
    }
    return { type, text };
  }
  if (type === 'like' || type === 'retweet') {
    const tweetId = typeof t.tweetId === 'string' ? t.tweetId.trim() : '';
    if (!TWEET_ID_RE.test(tweetId)) throw invalid('task.tweetId must be a numeric tweet id');
    return { type, tweetId };
  }
  const targetUsername = normalizeUsername(t.targetUsername);
  if (!targetUsername) throw invalid('task.targetUsername must be a valid X handle');
  return { type: 'follow', targetUsername };
}

/**
 * Strip a leading "@" and validate an X handle; returns null when invalid.
 * @param {unknown} value
 */
export function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const handle = value.trim().replace(/^@/, '');
  return USERNAME_RE.test(handle) ? handle : null;
}

/**
 * @param {{
 *   bearerToken?: string,
 *   fetch?: typeof globalThis.fetch,
 *   baseUrl?: string,
 *   timeoutMs?: number,
 *   maxPages?: number,
 *   tweetLookbackHours?: number,
 *   now?: () => Date,
 * }} [options]
 */
export function createTwitterVerificationService({
  bearerToken = process.env.TWITTER_BEARER_TOKEN,
  fetch: fetchImpl = globalThis.fetch,
  baseUrl = TWITTER_API_BASE_URL,
  timeoutMs = 5_000,
  maxPages = 5,
  tweetLookbackHours = 72,
  now = () => new Date(),
} = {}) {
  async function request(path, params = {}) {
    if (!bearerToken) {
      throw new SocialVerificationError('Twitter verification is not configured', {
        code: 'TWITTER_NOT_CONFIGURED',
        status: 503,
      });
    }

    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err?.name === 'AbortError';
      throw new SocialVerificationError(
        timedOut ? 'Twitter API request timed out' : 'Twitter API request failed',
        { code: 'TWITTER_UNAVAILABLE', status: 502 },
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset'));
      const retryAfterSeconds = Number.isFinite(reset)
        ? Math.max(0, Math.ceil(reset - now().getTime() / 1000))
        : 60;
      throw new SocialVerificationError('Twitter API rate limit reached', {
        code: 'TWITTER_RATE_LIMITED',
        status: 429,
        retryAfterSeconds,
      });
    }
    if (res.status === 401 || res.status === 403) {
      throw new SocialVerificationError('Twitter API rejected the app credentials', {
        code: 'TWITTER_AUTH_FAILED',
        status: 502,
      });
    }
    if (!res.ok) {
      throw new SocialVerificationError(`Twitter API responded with ${res.status}`, {
        code: 'TWITTER_UNAVAILABLE',
        status: 502,
      });
    }
    return res.json();
  }

  /** Resolve a handle to its user id, or null if the account doesn't exist. */
  async function resolveUserId(username) {
    const body = await request(`/2/users/by/username/${encodeURIComponent(username)}`);
    return body?.data?.id ?? null;
  }

  /**
   * Walk a paginated list endpoint until `match` returns true or pages run out.
   * @returns {Promise<{ found: boolean, pagesChecked: number }>}
   */
  async function scanPages(path, params, match) {
    let paginationToken;
    for (let page = 1; page <= maxPages; page++) {
      const body = await request(path, { ...params, pagination_token: paginationToken });
      const items = Array.isArray(body?.data) ? body.data : [];
      if (items.some(match)) return { found: true, pagesChecked: page };
      paginationToken = body?.meta?.next_token;
      if (!paginationToken) return { found: false, pagesChecked: page };
    }
    return { found: false, pagesChecked: maxPages };
  }

  /**
   * Verify that `username` completed `task`.
   *
   * @param {{ username: unknown, task: unknown }} input
   * @returns {Promise<{ verified: boolean, reason?: string, type: string, username: string, userId?: string }>}
   */
  async function verifyTask({ username, task }) {
    const handle = normalizeUsername(username);
    if (!handle) {
      throw new SocialVerificationError('username must be a valid X handle', {
        code: 'INVALID_USERNAME',
        status: 400,
      });
    }
    const parsed = parseSocialTask(task);

    const userId = await resolveUserId(handle);
    if (!userId) {
      return { verified: false, reason: 'USER_NOT_FOUND', type: parsed.type, username: handle };
    }
    const result = (found, reason) => ({
      verified: found,
      ...(found ? {} : { reason }),
      type: parsed.type,
      username: handle,
      userId,
    });

    if (parsed.type === 'tweet') {
      const startTime = new Date(now().getTime() - tweetLookbackHours * 3_600_000).toISOString();
      const needle = parsed.text.toLowerCase();
      const { found } = await scanPages(
        `/2/users/${userId}/tweets`,
        { max_results: 100, start_time: startTime, exclude: 'retweets' },
        (tweet) => typeof tweet?.text === 'string' && tweet.text.toLowerCase().includes(needle),
      );
      return result(found, 'TWEET_NOT_FOUND');
    }

    if (parsed.type === 'like' || parsed.type === 'retweet') {
      const endpoint = parsed.type === 'like' ? 'liking_users' : 'retweeted_by';
      const { found } = await scanPages(
        `/2/tweets/${parsed.tweetId}/${endpoint}`,
        { max_results: 100 },
        (user) => user?.id === userId,
      );
      return result(found, parsed.type === 'like' ? 'LIKE_NOT_FOUND' : 'RETWEET_NOT_FOUND');
    }

    const targetId = await resolveUserId(parsed.targetUsername);
    if (!targetId) return result(false, 'TARGET_NOT_FOUND');
    const { found } = await scanPages(
      `/2/users/${userId}/following`,
      { max_results: 1000 },
      (user) => user?.id === targetId,
    );
    return result(found, 'FOLLOW_NOT_FOUND');
  }

  return { verifyTask, resolveUserId, isConfigured: () => Boolean(bearerToken) };
}
