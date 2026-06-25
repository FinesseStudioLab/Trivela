// @ts-check

/**
 * Tenant-aware usage metering service (#574).
 *
 * Counters are stored in Redis (rolling windows) and periodically flushed to
 * SQLite/PG for billing and reporting. Falls back to DB-only when Redis is
 * unavailable, preserving correctness at the cost of some latency.
 *
 * Redis key schema:
 *   usage:{orgId}:{resource}:{windowStart}  – rolling window counter
 *   usage:{orgId}:{resource}:lifetime       – lifetime counter
 */

const FLUSH_INTERVAL_MS = 60_000;

/**
 * @param {{
 *   usageRepository: ReturnType<import('../dal/sqliteUsageRepository.js').createSqliteUsageRepository>,
 *   redisClient?: import('ioredis').Redis | null,
 *   timeProvider?: () => number,
 * }} params
 */
export function createUsageMeteringService({
  usageRepository,
  redisClient = null,
  timeProvider = Date.now,
}) {
  /**
   * Compute the start of the current rolling window (in ISO string) for a
   * given windowSeconds length.
   */
  function windowStart(windowSeconds, nowMs = timeProvider()) {
    const windowMs = windowSeconds * 1000;
    const startMs = Math.floor(nowMs / windowMs) * windowMs;
    return new Date(startMs).toISOString();
  }

  /**
   * Increment the usage counter for an org + resource.
   * Returns { count, windowStart, softLimit, hardLimit } after increment.
   *
   * If Redis is available the increment is atomic; otherwise we fall back to
   * a DB read-modify-write (safe for single-process deploys).
   */
  async function increment(orgId, resource) {
    const quota = usageRepository.getQuota(orgId, resource);
    const windowSecs = quota?.windowSeconds ?? 3600;
    const ws = windowStart(windowSecs);
    const windowMs = windowSecs * 1000;

    let count;

    if (redisClient) {
      const redisKey = `usage:${orgId}:${resource}:${ws}`;
      const lifetimeKey = `usage:${orgId}:${resource}:lifetime`;

      const results = await redisClient
        .multi()
        .incr(redisKey)
        .pttl(redisKey)
        .incr(lifetimeKey)
        .exec();

      if (!results || results[0]?.[0]) {
        throw new Error('Redis usage increment failed');
      }

      count = /** @type {number} */ (results[0][1]);
      const ttl = /** @type {number} */ (results[1][1]);

      if (ttl === -1 || ttl === -2) {
        await redisClient.pexpire(redisKey, windowMs);
      }
    } else {
      const existing = usageRepository.getUsageWindow(orgId, resource, ws);
      count = (existing?.count ?? 0) + 1;
      usageRepository.upsertUsageWindow({ orgId, resource, windowStart: ws, count });
    }

    return {
      count,
      windowStart: ws,
      softLimit: quota?.softLimit ?? null,
      hardLimit: quota?.hardLimit ?? null,
      windowSeconds: windowSecs,
    };
  }

  /**
   * Flush all live Redis counters to the DB for reporting/billing.
   * Called on a background interval and on graceful shutdown.
   */
  async function flushToDb() {
    if (!redisClient) return;

    const keys = await redisClient.keys('usage:*:*:*');
    for (const key of keys) {
      // Ignore lifetime keys — they're not window-based.
      if (key.endsWith(':lifetime')) continue;

      const parts = key.split(':');
      if (parts.length < 4) continue;
      // key format: usage:{orgId}:{resource}:{windowStart}
      // orgId may contain hyphens (UUID) — parts[1] is orgId, parts[2] is resource, rest is windowStart
      const orgId = parts[1];
      const resource = parts[2];
      const ws = parts.slice(3).join(':');

      const count = await redisClient.get(key);
      if (count === null) continue;

      usageRepository.upsertUsageWindow({
        orgId,
        resource,
        windowStart: ws,
        count: parseInt(count, 10),
      });
    }
  }

  /**
   * Return current-window usage + quota for every tracked resource for an org.
   */
  function getOrgUsage(orgId) {
    const quotas = usageRepository.getOrgQuotas(orgId);
    const quotaMap = Object.fromEntries(quotas.map((q) => [q.resource, q]));

    const usageRows = usageRepository.getOrgUsageSummary(orgId);
    // Keep only the most recent window per resource.
    const latestByResource = new Map();
    for (const row of usageRows) {
      if (!latestByResource.has(row.resource)) {
        latestByResource.set(row.resource, row);
      }
    }

    return Array.from(latestByResource.entries()).map(([resource, row]) => {
      const quota = quotaMap[resource] ?? null;
      return {
        resource,
        windowStart: row.windowStart,
        count: row.count,
        softLimit: quota?.softLimit ?? null,
        hardLimit: quota?.hardLimit ?? null,
        windowSeconds: quota?.windowSeconds ?? null,
      };
    });
  }

  /**
   * Admin export: all orgs, all resources, most recent window.
   */
  function adminExport() {
    return usageRepository.adminExportAll();
  }

  /**
   * Start periodic flush. Returns a cleanup function.
   */
  function startFlushInterval() {
    if (!redisClient) return () => {};
    const id = setInterval(() => {
      flushToDb().catch(() => {});
    }, FLUSH_INTERVAL_MS);
    id.unref?.();
    return () => clearInterval(id);
  }

  return { increment, flushToDb, getOrgUsage, adminExport, startFlushInterval };
}
