const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;

function defaultKeyGenerator(req) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey) {
    return `api-key:${apiKey}`;
  }

  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

function createMemoryStore() {
  const buckets = new Map();

  return {
    async increment(key, windowMs, now = Date.now()) {
      const existing = buckets.get(key);
      const bucket =
        existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

      bucket.count += 1;
      buckets.set(key, bucket);

      return {
        count: bucket.count,
        resetAt: bucket.resetAt,
      };
    },
  };
}

function createRedisStore(redisClient) {
  return {
    async increment(key, windowMs, now = Date.now()) {
      const redisKey = `ratelimit:${key}`;
      const resetAt = now + windowMs;

      const results = await redisClient.multi().incr(redisKey).pttl(redisKey).exec();

      if (!results || results[0]?.[0]) {
        throw new Error('Redis rate limit increment failed');
      }

      const count = results[0][1];
      let ttl = results[1][1];

      if (ttl === -1 || ttl === -2) {
        await redisClient.pexpire(redisKey, windowMs);
        ttl = windowMs;
      }

      return {
        count,
        resetAt: now + (ttl > 0 ? ttl : windowMs),
      };
    },
  };
}

export function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  timeProvider = () => Date.now(),
  keyGenerator = defaultKeyGenerator,
  store = null,
} = {}) {
  const rateLimitStore = store || createMemoryStore();

  return async function rateLimit(req, res, next) {
    try {
      const now = timeProvider();
      const key = keyGenerator(req);

      const { count, resetAt } = await rateLimitStore.increment(key, windowMs, now);

      const remaining = Math.max(maxRequests - count, 0);
      const resetSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(resetSeconds));
      res.setHeader('RateLimit-Policy', `${maxRequests};w=${windowSeconds}`);
      res.setHeader(
        'RateLimit',
        `limit=${maxRequests}, remaining=${remaining}, reset=${resetSeconds}`,
      );

      if (count > maxRequests) {
        const retryAfterSeconds = resetSeconds;
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          keying: 'per API key when present, otherwise per IP address',
          limit: maxRequests,
          windowMs,
          retryAfterSeconds,
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export { createMemoryStore, createRedisStore };
