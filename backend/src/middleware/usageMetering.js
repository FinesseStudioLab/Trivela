// @ts-check

/**
 * Per-tenant usage metering middleware (#574).
 *
 * Behaviour:
 *   – Increments the `api_calls` counter for the authenticated org on every
 *     request that carries a valid org-scoped API key.
 *   – Sets informational quota headers on every response.
 *   – Adds `X-Quota-Warning` when the soft limit is reached.
 *   – Enforces the hard limit with 429 before the request is processed.
 *
 * Unauthenticated requests and env-sourced keys with no orgId pass through
 * unmetered.
 */

/**
 * @param {{
 *   usageMeteringService: ReturnType<import('../services/usageMeteringService.js').createUsageMeteringService>,
 *   resource?: string,
 * }} options
 */
export function createUsageMeteringMiddleware({ usageMeteringService, resource = 'api_calls' }) {
  return async function usageMeteringMiddleware(req, res, next) {
    const orgId = req.auth?.orgId;
    if (!orgId) return next();

    let result;
    try {
      result = await usageMeteringService.increment(orgId, resource);
    } catch {
      // Metering failure must never block the request.
      return next();
    }

    const { count, softLimit, hardLimit, windowSeconds } = result;

    if (hardLimit !== null) {
      res.setHeader('X-Quota-Limit', String(hardLimit));
    }
    res.setHeader('X-Quota-Used', String(count));
    if (windowSeconds !== null) {
      res.setHeader('X-Quota-Window', String(windowSeconds));
    }

    if (hardLimit !== null && count > hardLimit) {
      return res.status(429).json({
        error: 'Tenant quota exceeded',
        code: 'QUOTA_EXCEEDED',
        resource,
        limit: hardLimit,
        used: count,
      });
    }

    if (softLimit !== null && count >= softLimit) {
      res.setHeader(
        'X-Quota-Warning',
        `Approaching hard limit: ${count}/${hardLimit ?? 'unlimited'} ${resource} used this window`,
      );
    }

    return next();
  };
}
