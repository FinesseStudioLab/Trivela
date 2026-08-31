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
  // Optional per-request override (#924 — per-API-key rate tiers). Given the
  // request, returns `{ maxRequests, windowMs }` to use instead of the static
  // defaults above, or a falsy value to fall back to them. Sync or async.
  resolveLimits = null,
  // Optional monthly quota hooks (#759), independent of the windowed
  // maxRequests/windowMs check above: the window check limits burst/sustained
  // rate, this limits total volume over a calendar month regardless of how
  // it's spread out. All three are required together or all omitted.
  //   - resolveMonthlyQuota(req): number | null | undefined — the quota for
  //     this request's key, or null/undefined for "no monthly quota".
  //   - getMonthlyUsage(req): current count for the active period, without
  //     incrementing it (used only to report `X-Monthly-Quota-Remaining`
  //     when a request is rejected for being over quota).
  //   - incrementMonthlyUsage(req): increments and returns the new count.
  //     Only called for requests that pass the per-window check, so a
  //     request rejected with 429 for burst-rate reasons doesn't also
  //     consume quota.
  resolveMonthlyQuota = null,
  getMonthlyUsage = null,
  incrementMonthlyUsage = null,
} = {}) {
  const rateLimitStore = store || createMemoryStore();

  return async function rateLimit(req, res, next) {
    try {
      const now = timeProvider();
      const key = keyGenerator(req);
      const override = resolveLimits ? await resolveLimits(req) : null;
      const effectiveMaxRequests = override?.maxRequests ?? maxRequests;
      const effectiveWindowMs = override?.windowMs ?? windowMs;

      const { count, resetAt } = await rateLimitStore.increment(key, effectiveWindowMs, now);

      const remaining = Math.max(effectiveMaxRequests - count, 0);
      const resetSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      const windowSeconds = Math.max(1, Math.ceil(effectiveWindowMs / 1000));
      res.setHeader('X-RateLimit-Limit', String(effectiveMaxRequests));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(resetSeconds));
      res.setHeader('RateLimit-Policy', `${effectiveMaxRequests};w=${windowSeconds}`);
      res.setHeader(
        'RateLimit',
        `limit=${effectiveMaxRequests}, remaining=${remaining}, reset=${resetSeconds}`,
      );

      if (count > effectiveMaxRequests) {
        const retryAfterSeconds = resetSeconds;
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          keying: 'per API key when present, otherwise per IP address',
          limit: effectiveMaxRequests,
          windowMs: effectiveWindowMs,
          retryAfterSeconds,
        });
      }

      // Monthly quota (#759) — separate from the per-window check above.
      // Only checked/incremented once a request has already passed the
      // burst-rate check, so a request rejected above doesn't also spend
      // quota.
      if (resolveMonthlyQuota && getMonthlyUsage && incrementMonthlyUsage) {
        const monthlyQuota = await resolveMonthlyQuota(req);
        if (typeof monthlyQuota === 'number' && monthlyQuota > 0) {
          const currentUsage = await getMonthlyUsage(req);
          if (currentUsage >= monthlyQuota) {
            res.setHeader('X-Monthly-Quota-Limit', String(monthlyQuota));
            res.setHeader('X-Monthly-Quota-Remaining', '0');
            // Best-effort seconds until the top of next UTC month — not a
            // precise reset time, just enough for a client to back off
            // sensibly rather than retry immediately.
            const nowDate = new Date(now);
            const nextMonth = Date.UTC(
              nowDate.getUTCFullYear(),
              nowDate.getUTCMonth() + 1,
              1,
            );
            const retryAfterSeconds = Math.max(1, Math.ceil((nextMonth - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
              error: 'Monthly quota exceeded',
              code: 'MONTHLY_QUOTA_EXCEEDED',
              quota: monthlyQuota,
              used: currentUsage,
              retryAfterSeconds,
            });
          }

          const newUsage = await incrementMonthlyUsage(req);
          res.setHeader('X-Monthly-Quota-Limit', String(monthlyQuota));
          res.setHeader(
            'X-Monthly-Quota-Remaining',
            String(Math.max(monthlyQuota - newUsage, 0)),
          );
        }
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export { createMemoryStore, createRedisStore };
