const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;

function defaultKeyGenerator(req) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey) {
    return `api-key:${apiKey}`;
  }

  return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

export function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  timeProvider = () => Date.now(),
  keyGenerator = defaultKeyGenerator,
} = {}) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const now = timeProvider();
    const key = keyGenerator(req);
    const existing = buckets.get(key);
    const bucket =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(maxRequests - bucket.count, 0);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));
    res.setHeader('RateLimit-Policy', `${maxRequests};w=${windowSeconds}`);
    res.setHeader(
      'RateLimit',
      `limit=${maxRequests}, remaining=${remaining}, reset=${resetSeconds}`,
    );

    if (bucket.count > maxRequests) {
      const retryAfterSeconds = resetSeconds;
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Rate limit exceeded',
        keying: 'per API key when present, otherwise per IP address',
        limit: maxRequests,
        windowMs,
        retryAfterSeconds,
      });
    }

    return next();
  };
}
