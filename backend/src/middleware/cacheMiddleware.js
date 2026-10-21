// @ts-check
import { defaultCacheService } from '../services/cacheService.js';

/**
 * Creates Express middleware to cache GET requests using CacheService.
 * @param {object} [options]
 * @param {number} [options.ttlSec]
 * @param {string} [options.keyPrefix]
 * @param {import('../services/cacheService.js').CacheService} [options.cacheService]
 */
export function createCacheMiddleware(options = {}) {
  const ttlSec = options.ttlSec ?? 60;
  const keyPrefix = options.keyPrefix ?? 'cache:http';
  const cache = options.cacheService ?? defaultCacheService;

  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `${keyPrefix}:${req.originalUrl || req.url}`;

    try {
      const cachedData = await cache.get(cacheKey);
      if (cachedData !== null) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedData);
      }
    } catch {
      // Ignore cache fetch error and proceed
    }

    res.setHeader('X-Cache', 'MISS');

    // Intercept res.json to capture payload and cache it
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, body, ttlSec).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
}
