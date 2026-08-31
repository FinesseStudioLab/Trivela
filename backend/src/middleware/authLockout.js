// @ts-check
//
// Brute-force / credential-stuffing protection for auth-bearing endpoints (#588).
//
// This middleware sits *in front of* the API-key and master-key auth
// middleware. It never inspects credentials itself — instead it observes the
// response status of each guarded request:
//
//   - a 401 (auth rejected) counts as a failed attempt for the client key
//   - a 2xx/3xx (auth accepted, or a no-op when auth is unconfigured) clears
//     the client's failure record
//
// Escalation:
//   1. After `softThreshold` consecutive failures it injects a progressive,
//      exponentially-growing delay before the request is processed. This slows
//      automated guessing to a crawl without hard-locking a fat-fingered human.
//   2. After `hardThreshold` failures it issues a temporary lockout: further
//      attempts are rejected immediately with 429 + Retry-After until the
//      lockout expires. Repeat lockout episodes from the same key back off
//      exponentially (capped at `maxLockoutMs`).
//
// A spike in failures/lockouts is observable two ways: the `onFailure` /
// `onLockout` hooks (wired to structured warn logs + the trivela_auth_*
// counters on /metrics) and the lockout headers on blocked responses. Alert
// rules live in .github/workflows/alertingrules.yml.
//
// The store is pluggable and the clock/delay are injectable, mirroring the
// rate-limit middleware so the whole thing is deterministically unit-testable.

const DEFAULT_SOFT_THRESHOLD = 5;
const DEFAULT_HARD_THRESHOLD = 10;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5_000;
const DEFAULT_BASE_LOCKOUT_MS = 60_000; // 1 minute
const DEFAULT_MAX_LOCKOUT_MS = 3_600_000; // 1 hour
const DEFAULT_FAILURE_WINDOW_MS = 900_000; // 15 minutes
const DEFAULT_MAX_TRACKED_KEYS = 10_000;

/**
 * Default key: the client IP. Brute-force / credential-stuffing presents many
 * *different* (invalid) credentials from one origin, so keying by the presented
 * credential would never accumulate — IP is the right axis to throttle.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function defaultKeyGenerator(req) {
  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

/**
 * In-memory lockout store. Bounded so a distributed attack across many IPs
 * can't grow it without limit — when full, the oldest-inserted key is evicted.
 *
 * @param {{ maxEntries?: number }} [options]
 */
export function createLockoutMemoryStore({ maxEntries = DEFAULT_MAX_TRACKED_KEYS } = {}) {
  /** @type {Map<string, LockoutRecord>} */
  const entries = new Map();

  return {
    /** @param {string} key @returns {LockoutRecord | undefined} */
    get(key) {
      return entries.get(key);
    },
    /** @param {string} key @param {LockoutRecord} record */
    set(key, record) {
      // Re-insert so Map iteration order reflects recency (for eviction).
      entries.delete(key);
      entries.set(key, record);
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) {
          entries.delete(oldest);
        }
      }
    },
    /** @param {string} key */
    delete(key) {
      entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}

/**
 * @typedef {{
 *   failures: number,
 *   firstFailureAt: number,
 *   lockedUntil: number,
 *   lockoutCount: number,
 *   lastSeen: number,
 * }} LockoutRecord
 */

/**
 * @param {{
 *   softThreshold?: number,
 *   hardThreshold?: number,
 *   baseDelayMs?: number,
 *   maxDelayMs?: number,
 *   baseLockoutMs?: number,
 *   maxLockoutMs?: number,
 *   failureWindowMs?: number,
 *   timeProvider?: () => number,
 *   keyGenerator?: (req: import('express').Request) => string,
 *   store?: ReturnType<typeof createLockoutMemoryStore>,
 *   delayFn?: (ms: number) => Promise<void>,
 *   onFailure?: ((info: { key: string, failures: number }) => void) | null,
 *   onLockout?: ((info: { key: string, failures: number, lockoutMs: number, lockoutCount: number }) => void) | null,
 *   isAuthFailure?: (res: import('express').Response) => boolean,
 *   isAuthSuccess?: (res: import('express').Response) => boolean,
 * }} [options]
 */
export function createAuthLockout({
  softThreshold = DEFAULT_SOFT_THRESHOLD,
  hardThreshold = DEFAULT_HARD_THRESHOLD,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
  baseLockoutMs = DEFAULT_BASE_LOCKOUT_MS,
  maxLockoutMs = DEFAULT_MAX_LOCKOUT_MS,
  failureWindowMs = DEFAULT_FAILURE_WINDOW_MS,
  timeProvider = () => Date.now(),
  keyGenerator = defaultKeyGenerator,
  store = createLockoutMemoryStore(),
  delayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onFailure = null,
  onLockout = null,
  isAuthFailure = (res) => res.statusCode === 401,
  isAuthSuccess = (res) => res.statusCode >= 200 && res.statusCode < 400,
} = {}) {
  /**
   * Fold the outcome of a finished request into the key's failure record.
   * @param {string} key
   * @param {import('express').Response} res
   */
  function recordOutcome(key, res) {
    const now = timeProvider();

    if (isAuthSuccess(res)) {
      // A genuine success wipes the slate clean for this key.
      if (store.get(key)) {
        store.delete(key);
      }
      return;
    }

    if (!isAuthFailure(res)) {
      // Neither an auth pass nor an auth rejection (e.g. a 400/404/500 or the
      // 429 we ourselves emitted while locked) — don't let it move the counter.
      return;
    }

    const existing = store.get(key);
    /** @type {LockoutRecord} */
    const record = existing ?? {
      failures: 0,
      firstFailureAt: now,
      lockedUntil: 0,
      lockoutCount: 0,
      lastSeen: now,
    };

    record.failures += 1;
    record.lastSeen = now;
    if (!record.firstFailureAt) {
      record.firstFailureAt = now;
    }

    onFailure?.({ key, failures: record.failures });

    if (record.failures >= hardThreshold) {
      record.lockoutCount += 1;
      const lockoutMs = Math.min(maxLockoutMs, baseLockoutMs * 2 ** (record.lockoutCount - 1));
      record.lockedUntil = now + lockoutMs;
      onLockout?.({ key, failures: record.failures, lockoutMs, lockoutCount: record.lockoutCount });
    }

    store.set(key, record);
  }

  return async function authLockout(req, res, next) {
    const now = timeProvider();
    const key = keyGenerator(req);
    let record = store.get(key);

    // Forget a key once it's no longer locked and its failure window has
    // elapsed — a sliding reset so transient mistakes don't accumulate forever.
    if (
      record &&
      record.lockedUntil <= now &&
      record.firstFailureAt &&
      now - record.firstFailureAt > failureWindowMs
    ) {
      store.delete(key);
      record = undefined;
    }

    // Hard lockout in effect → reject before the auth middleware even runs.
    if (record && record.lockedUntil > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-Auth-Lockout', 'active');
      return res.status(429).json({
        error: 'Too many failed authentication attempts. Try again later.',
        code: 'AUTH_LOCKED_OUT',
        retryAfterSeconds,
      });
    }

    // Observe how this request resolves so we can update the record. `finish`
    // fires once the response is fully sent, exactly like the request-metrics
    // middleware in index.js.
    res.on('finish', () => {
      try {
        recordOutcome(key, res);
      } catch {
        // Never let bookkeeping break a response that already went out.
      }
    });

    // Progressive delay once past the soft threshold. The Nth failure beyond
    // the threshold waits baseDelayMs * 2^(N-1), capped at maxDelayMs.
    const failures = record?.failures ?? 0;
    if (failures >= softThreshold) {
      const over = failures - softThreshold + 1;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (over - 1));
      res.setHeader('X-Auth-Throttle-Delay-Ms', String(delay));
      await delayFn(delay);
    }

    return next();
  };
}

export { defaultKeyGenerator };
