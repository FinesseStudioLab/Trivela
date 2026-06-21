const DEFAULT_BACKOFF_MS = 30_000;
const DEFAULT_MAX_CONCURRENT = 10;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5_000;

/**
 * Typed error thrown when the RPC pool is saturated and an acquire times out.
 * Callers should catch this and respond with HTTP 503 + code POOL_SATURATED.
 */
export class PoolSaturatedError extends Error {
  constructor(waitMs) {
    super(`RPC pool saturated: no slot available after ${waitMs}ms`);
    this.name = 'PoolSaturatedError';
    this.code = 'POOL_SATURATED';
  }
}

/**
 * Creates a round-robin RPC connection pool with automatic failover,
 * backoff-based recovery, concurrency tracking, and acquire timeouts.
 *
 * The pool tracks in-flight calls via acquire()/release() so saturation
 * metrics (in_use / idle / waiting) are always current.  When the concurrency
 * cap is reached and an acquire() caller waits longer than acquireTimeoutMs,
 * a PoolSaturatedError is thrown instead of hanging indefinitely.
 *
 * @param {string[]} urls
 * @param {{ backoffMs?: number, maxConcurrent?: number, acquireTimeoutMs?: number }} [options]
 */
export function createRpcPool(
  urls,
  {
    backoffMs = DEFAULT_BACKOFF_MS,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
  } = {},
) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('RPC pool requires at least one URL');
  }

  const endpoints = urls.map((url) => ({
    url,
    healthy: true,
    unhealthySince: /** @type {number|null} */ (null),
  }));

  let rrIndex = 0;

  // Concurrency counters for saturation metrics.
  let _inUse = 0;
  const _waiters = [];

  function _recoverStale() {
    const now = Date.now();
    for (const ep of endpoints) {
      if (!ep.healthy && ep.unhealthySince !== null && now - ep.unhealthySince >= backoffMs) {
        ep.healthy = true;
        ep.unhealthySince = null;
      }
    }
  }

  /**
   * Returns the next healthy URL via round-robin.
   * Falls back to the first URL when all endpoints are unhealthy.
   *
   * @returns {string}
   */
  function getHealthyRpcUrl() {
    _recoverStale();
    for (let i = 0; i < endpoints.length; i++) {
      const idx = (rrIndex + i) % endpoints.length;
      if (endpoints[idx].healthy) {
        rrIndex = (idx + 1) % endpoints.length;
        return endpoints[idx].url;
      }
    }
    // All unhealthy: fall back to first
    return endpoints[0].url;
  }

  /**
   * Acquire a slot in the pool and return the URL to use.
   *
   * If the pool is at capacity the caller waits up to acquireTimeoutMs before
   * a PoolSaturatedError is thrown (typed 503 at the HTTP layer).
   *
   * Always pair with release() in a finally block.
   *
   * @returns {Promise<string>}
   */
  async function acquire() {
    if (_inUse < maxConcurrent) {
      _inUse += 1;
      return getHealthyRpcUrl();
    }

    // Pool is saturated — queue the caller with a deadline.
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = _waiters.indexOf(waiter);
        if (idx !== -1) _waiters.splice(idx, 1);
        reject(new PoolSaturatedError(acquireTimeoutMs));
      }, acquireTimeoutMs);

      function waiter() {
        clearTimeout(timer);
        _inUse += 1;
        resolve(getHealthyRpcUrl());
      }

      void startedAt; // suppress lint
      _waiters.push(waiter);
    });
  }

  /**
   * Release a previously acquired slot and wake the next waiter, if any.
   */
  function release() {
    if (_inUse > 0) _inUse -= 1;
    const next = _waiters.shift();
    if (next) next();
  }

  /**
   * Marks an endpoint as unhealthy and starts its backoff timer.
   *
   * @param {string} url
   */
  function markUnhealthy(url) {
    const ep = endpoints.find((e) => e.url === url);
    if (ep && ep.healthy) {
      ep.healthy = false;
      ep.unhealthySince = Date.now();
    }
  }

  /**
   * Marks an endpoint as healthy, clearing any backoff state.
   *
   * @param {string} url
   */
  function markHealthy(url) {
    const ep = endpoints.find((e) => e.url === url);
    if (ep) {
      ep.healthy = true;
      ep.unhealthySince = null;
    }
  }

  /**
   * Returns pool status for health endpoint exposure.
   *
   * Includes saturation counters:
   *   - in_use:   slots currently occupied by active callers
   *   - idle:     slots available immediately
   *   - waiting:  callers queued pending a slot
   *
   * @returns {{ healthy: number, unhealthy: number, urls: { url: string, healthy: boolean }[], in_use: number, idle: number, waiting: number, max: number }}
   */
  function getStatus() {
    _recoverStale();
    return {
      healthy: endpoints.filter((ep) => ep.healthy).length,
      unhealthy: endpoints.filter((ep) => !ep.healthy).length,
      urls: endpoints.map((ep) => ({ url: ep.url, healthy: ep.healthy })),
      in_use: _inUse,
      idle: Math.max(0, maxConcurrent - _inUse),
      waiting: _waiters.length,
      max: maxConcurrent,
    };
  }

  /**
   * Returns all configured URLs in pool order.
   *
   * @returns {string[]}
   */
  function getUrls() {
    return endpoints.map((ep) => ep.url);
  }

  return {
    getHealthyRpcUrl,
    acquire,
    release,
    markUnhealthy,
    markHealthy,
    getStatus,
    getUrls,
    PoolSaturatedError,
  };
}
