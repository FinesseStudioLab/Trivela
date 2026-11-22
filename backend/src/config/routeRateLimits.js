// @ts-check

/**
 * Per-route rate limits (#465). The global limiter applies one budget to every
 * route; write-heavy endpoints need a tighter one than reads, and admin routes
 * may need their own. A rule is `{ method, path, maxRequests, windowMs? }`
 * where `path` is an Express-style template relative to the API version prefix
 * (`/campaigns/:id/image`). A matching rule gets its own counter bucket and can
 * only tighten the effective limit, never loosen it (so a per-API-key tier
 * that is already stricter still wins).
 */

/** @typedef {{ method: string, path: string, maxRequests: number, windowMs?: number }} RouteRateLimitRule */

/** @type {RouteRateLimitRule[]} */
export const DEFAULT_ROUTE_RATE_LIMITS = [
  { method: 'POST', path: '/campaigns', maxRequests: 30 },
  { method: 'POST', path: '/campaigns/:id/clone', maxRequests: 20 },
  { method: 'POST', path: '/campaigns/:id/image', maxRequests: 10 },
  { method: 'PUT', path: '/campaigns/:id', maxRequests: 30 },
  { method: 'DELETE', path: '/campaigns/:id', maxRequests: 20 },
];

/** @param {string} template */
function templateToRegExp(template) {
  const source = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[A-Za-z0-9_]+/g, '[^/]+');
  return new RegExp(`^${source}/?$`);
}

/** Strips the `/api` or `/api/v1` prefix so rules are version-independent. */
function stripApiPrefix(pathname) {
  return pathname.replace(/^\/api(?:\/v\d+)?(?=\/|$)/, '') || '/';
}

/**
 * Parses `RATE_LIMIT_ROUTES`, a JSON array of rules that replaces the defaults.
 * Invalid entries are dropped rather than failing startup.
 * @param {string | undefined} raw
 * @returns {RouteRateLimitRule[] | null}
 */
export function parseRouteRateLimits(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (rule) =>
        rule &&
        typeof rule.method === 'string' &&
        typeof rule.path === 'string' &&
        Number.isInteger(rule.maxRequests) &&
        rule.maxRequests > 0 &&
        (rule.windowMs === undefined || (Number.isInteger(rule.windowMs) && rule.windowMs > 0)),
    );
  } catch {
    return null;
  }
}

/**
 * Builds a resolver `(req) => { id, maxRequests, windowMs? } | null`.
 * @param {RouteRateLimitRule[]} [rules]
 */
export function createRouteRateLimitResolver(rules = DEFAULT_ROUTE_RATE_LIMITS) {
  const compiled = rules.map((rule) => ({
    method: rule.method.toUpperCase(),
    matcher: templateToRegExp(rule.path),
    id: `${rule.method.toUpperCase()} ${rule.path}`,
    maxRequests: rule.maxRequests,
    windowMs: rule.windowMs,
  }));

  return function resolveRouteLimit(req) {
    const pathname = stripApiPrefix((req.originalUrl || req.url || '').split('?')[0]);
    const method = String(req.method || '').toUpperCase();
    const match = compiled.find((rule) => rule.method === method && rule.matcher.test(pathname));
    return match
      ? { id: match.id, maxRequests: match.maxRequests, windowMs: match.windowMs }
      : null;
  };
}
