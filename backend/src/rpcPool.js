const DEFAULT_BACKOFF_MS = 30_000;

/**
 * Creates a round-robin RPC connection pool with automatic failover and
 * backoff-based recovery.
 *
 * @param {string[]} urls
 * @param {{ backoffMs?: number }} [options]
 */
export function createRpcPool(urls, { backoffMs = DEFAULT_BACKOFF_MS } = {}) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('RPC pool requires at least one URL');
  }

  const endpoints = urls.map((url) => ({
    url,
    healthy: true,
    unhealthySince: /** @type {number|null} */ (null),
  }));

  let rrIndex = 0;

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
   * @returns {{ healthy: number, unhealthy: number, urls: { url: string, healthy: boolean }[] }}
   */
  function getStatus() {
    _recoverStale();
    return {
      healthy: endpoints.filter((ep) => ep.healthy).length,
      unhealthy: endpoints.filter((ep) => !ep.healthy).length,
      urls: endpoints.map((ep) => ({ url: ep.url, healthy: ep.healthy })),
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

  return { getHealthyRpcUrl, markUnhealthy, markHealthy, getStatus, getUrls };
}
