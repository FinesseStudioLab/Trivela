const DEFAULT_BACKOFF_MS = 30_000;
const DEFAULT_MAX_CONCURRENT = 10;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5_000;

// Circuit breaker state machine values per endpoint.
const BREAKER_CLOSED = 'closed';
const BREAKER_OPEN = 'open';
const BREAKER_HALF_OPEN = 'half_open';

// Circuit breaker defaults — conservative values suited for a Soroban RPC pool.
const DEFAULT_CB_WINDOW_SIZE = 10;
const DEFAULT_CB_ERROR_THRESHOLD = 0.5;
const DEFAULT_CB_LATENCY_MS = 2_000;
const DEFAULT_CB_OPEN_DURATION_MS = 30_000;

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
 * backoff-based recovery, concurrency tracking, acquire timeouts, and a
 * per-endpoint circuit breaker that trips on sustained error rates or slow
 * calls (latency-based tripping) and recovers via half-open probing.
 *
 * Circuit breaker lifecycle per endpoint:
 *   closed → open  : error rate ≥ threshold over the last `windowSize` calls,
 *                     or enough slow calls (latencyMs > latencyThresholdMs).
 *   open → half_open: after `openDurationMs` ms the endpoint gets one probe.
 *   half_open → closed: probe succeeds (success=true, latency within threshold).
 *   half_open → open  : probe fails.
 *
 * The bulkhead (concurrency cap + acquire queue) coexists with the circuit
 * breaker: `acquire()` already enforces the bulkhead; `reportOutcome()` drives
 * breaker transitions so callers feed back real success/failure/latency data.
 *
 * @param {string[]} urls
 * @param {{
 *   backoffMs?: number,
 *   maxConcurrent?: number,
 *   acquireTimeoutMs?: number,
 *   circuitBreaker?: {
 *     windowSize?: number,
 *     errorThreshold?: number,
 *     latencyThresholdMs?: number,
 *     openDurationMs?: number,
 *   }
 * }} [options]
 */
export function createRpcPool(
  urls,
  {
    backoffMs = DEFAULT_BACKOFF_MS,
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
    circuitBreaker: cbOpts = {},
  } = {},
) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('RPC pool requires at least one URL');
  }

  const {
    windowSize = DEFAULT_CB_WINDOW_SIZE,
    errorThreshold = DEFAULT_CB_ERROR_THRESHOLD,
    latencyThresholdMs = DEFAULT_CB_LATENCY_MS,
    openDurationMs = DEFAULT_CB_OPEN_DURATION_MS,
  } = cbOpts;

  const endpoints = urls.map((url) => ({
    url,
    healthy: true,
    unhealthySince: /** @type {number|null} */ (null),
    // Circuit breaker state
    breakerState: BREAKER_CLOSED,
    openSince: /** @type {number|null} */ (null),
    halfOpenInFlight: false,
    /** @type {{ isError: boolean }[]} */
    window: [],
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
      // Advance open → half_open once the cooldown has elapsed.
      if (
        ep.breakerState === BREAKER_OPEN &&
        ep.openSince !== null &&
        now - ep.openSince >= openDurationMs
      ) {
        ep.breakerState = BREAKER_HALF_OPEN;
        ep.openSince = null;
        ep.halfOpenInFlight = false;
      }
    }
  }

  function _isAvailable(ep) {
    return (
      ep.healthy &&
      ep.breakerState !== BREAKER_OPEN &&
      !(ep.breakerState === BREAKER_HALF_OPEN && ep.halfOpenInFlight)
    );
  }

  /**
   * Returns the next available URL via round-robin, skipping endpoints whose
   * circuit breaker is open or whose half-open probe is already in flight.
   * Falls back to the first URL when no endpoint is available.
   *
   * @returns {string}
   */
  function getHealthyRpcUrl() {
    _recoverStale();
    for (let i = 0; i < endpoints.length; i++) {
      const idx = (rrIndex + i) % endpoints.length;
      const ep = endpoints[idx];
      if (_isAvailable(ep)) {
        rrIndex = (idx + 1) % endpoints.length;
        if (ep.breakerState === BREAKER_HALF_OPEN) {
          ep.halfOpenInFlight = true;
        }
        return ep.url;
      }
    }
    // All endpoints unavailable: fall back to first (fail-open safety valve).
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
   * Feed back the outcome of an RPC call to drive circuit-breaker transitions.
   *
   * Slow calls (latencyMs > latencyThresholdMs) count as errors even when
   * success=true so a degraded-but-up RPC trips the breaker without hard
   * failures. Call this inside the same try/finally as acquire()/release().
   *
   * @param {string} url - The endpoint URL returned by acquire() / getHealthyRpcUrl().
   * @param {{ success: boolean, latencyMs?: number }} outcome
   */
  function reportOutcome(url, { success, latencyMs = 0 }) {
    const ep = endpoints.find((e) => e.url === url);
    if (!ep) return;

    const isError = !success || latencyMs > latencyThresholdMs;

    if (ep.breakerState === BREAKER_HALF_OPEN) {
      ep.halfOpenInFlight = false;
      if (!isError) {
        // Probe succeeded — close the breaker and clear the window.
        ep.breakerState = BREAKER_CLOSED;
        ep.openSince = null;
        ep.window = [];
      } else {
        // Probe failed — reopen immediately.
        ep.breakerState = BREAKER_OPEN;
        ep.openSince = Date.now();
      }
      return;
    }

    if (ep.breakerState !== BREAKER_CLOSED) return;

    // Maintain a fixed-size sliding window of recent outcomes.
    ep.window.push({ isError });
    if (ep.window.length > windowSize) ep.window.shift();

    // Trip the breaker once the window is full and error rate meets threshold.
    if (ep.window.length >= windowSize) {
      const errorCount = ep.window.filter((e) => e.isError).length;
      if (errorCount / ep.window.length >= errorThreshold) {
        ep.breakerState = BREAKER_OPEN;
        ep.openSince = Date.now();
        ep.window = [];
      }
    }
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
   * Marks an endpoint as healthy, clearing any backoff and circuit-breaker state.
   *
   * @param {string} url
   */
  function markHealthy(url) {
    const ep = endpoints.find((e) => e.url === url);
    if (ep) {
      ep.healthy = true;
      ep.unhealthySince = null;
      ep.breakerState = BREAKER_CLOSED;
      ep.openSince = null;
      ep.window = [];
      ep.halfOpenInFlight = false;
    }
  }

  /**
   * Returns pool status for health endpoint exposure.
   *
   * Saturation counters:
   *   - in_use:   slots currently occupied by active callers
   *   - idle:     slots available immediately
   *   - waiting:  callers queued pending a slot
   *
   * Each url entry includes `breakerState` ('closed' | 'open' | 'half_open')
   * so the health route can surface circuit-breaker degradation to operators.
   *
   * @returns {{
   *   healthy: number,
   *   unhealthy: number,
   *   urls: { url: string, healthy: boolean, breakerState: string }[],
   *   in_use: number,
   *   idle: number,
   *   waiting: number,
   *   max: number
   * }}
   */
  function getStatus() {
    _recoverStale();
    return {
      healthy: endpoints.filter((ep) => ep.healthy).length,
      unhealthy: endpoints.filter((ep) => !ep.healthy).length,
      urls: endpoints.map((ep) => ({
        url: ep.url,
        healthy: ep.healthy,
        breakerState: ep.breakerState,
      })),
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
    reportOutcome,
    getStatus,
    getUrls,
    PoolSaturatedError,
  };
}
