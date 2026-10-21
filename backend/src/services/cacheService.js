// @ts-check

/**
 * Cache service providing Redis caching with an automatic in-memory fallback
 * for hot read endpoints (campaigns, balances, leaderboards).
 */
export class CacheService {
  /**
   * @param {object} [options]
   * @param {import('ioredis').Redis | null} [options.redisClient]
   * @param {number} [options.defaultTtlSec]
   */
  constructor(options = {}) {
    this.redisClient = options.redisClient ?? null;
    this.defaultTtlSec = options.defaultTtlSec ?? 60;
    /** @type {Map<string, { value: any, expiresAt: number }>} */
    this.memoryCache = new Map();
  }

  /**
   * Get cached JSON object by key.
   * @param {string} key
   * @returns {Promise<any | null>}
   */
  async get(key) {
    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(key);
        if (raw) {
          return JSON.parse(raw);
        }
        return null;
      } catch {
        // Fallback to memory on Redis error
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set cached value with TTL in seconds.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlSec]
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSec = this.defaultTtlSec) {
    const serialized = JSON.stringify(value);

    if (this.redisClient) {
      try {
        await this.redisClient.set(key, serialized, 'EX', ttlSec);
        return;
      } catch {
        // Fallback to memory
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  /**
   * Delete specific cache key or pattern.
   * @param {string} keyOrPattern
   * @returns {Promise<void>}
   */
  async del(keyOrPattern) {
    if (this.redisClient) {
      try {
        if (keyOrPattern.includes('*')) {
          const keys = await this.redisClient.keys(keyOrPattern);
          if (keys.length > 0) {
            await this.redisClient.del(...keys);
          }
        } else {
          await this.redisClient.del(keyOrPattern);
        }
      } catch {
        // Fallback memory delete
      }
    }

    for (const key of this.memoryCache.keys()) {
      if (
        key === keyOrPattern ||
        (keyOrPattern.includes('*') && this._matchPattern(key, keyOrPattern))
      ) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Simple wildcard pattern matcher for memory cache fallback.
   * @param {string} key
   * @param {string} pattern
   * @private
   */
  _matchPattern(key, pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(key);
  }

  /** Invalidate all campaign cache keys */
  async invalidateCampaigns() {
    await this.del('cache:campaigns:*');
    await this.del('cache:campaign:*');
  }

  /**
   * Invalidate balance cache for a given address
   * @param {string} address
   */
  async invalidateBalances(address) {
    await this.del(`cache:balance:${address}`);
    await this.del('cache:balances:*');
  }

  /** Invalidate leaderboard cache */
  async invalidateLeaderboard() {
    await this.del('cache:leaderboard:*');
  }

  /** Clear all cache entries */
  async clear() {
    this.memoryCache.clear();
    if (this.redisClient) {
      try {
        const keys = await this.redisClient.keys('cache:*');
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch {
        // Best-effort: a stale cache entry is not worse than throwing here.
      }
    }
  }
}

export const defaultCacheService = new CacheService();
