// @ts-check
import { DEPRECATION_REGISTRY } from '../deprecations.js';

/**
 * Match a request path+method against the deprecation registry.
 * Registry keys are like "GET /api/v1/campaigns/:id/stats"; path segments
 * starting with ":" are treated as wildcards.
 *
 * @param {string} method  e.g. "GET"
 * @param {string} path    e.g. "/api/v1/campaigns/42/stats"
 * @returns {import('../deprecations.js').DeprecationEntry | null}
 */
function matchDeprecation(method, path) {
  for (const [pattern, entry] of Object.entries(DEPRECATION_REGISTRY)) {
    const [patternMethod, ...rest] = pattern.split(' ');
    const patternPath = rest.join(' ');

    if (patternMethod.toUpperCase() !== method.toUpperCase()) continue;

    const patternParts = patternPath.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const matched = patternParts.every(
      (seg, i) => seg.startsWith(':') || seg === pathParts[i],
    );

    if (matched) return entry;
  }
  return null;
}

/**
 * Express middleware that injects RFC 8594 deprecation headers for
 * any route registered in the deprecation registry, and WARN-logs usage
 * so operators know which deprecated endpoints are still being hit.
 *
 * @param {{ log?: { warn?: Function } }} [options]
 * @returns {import('express').RequestHandler}
 */
export function createDeprecationMiddleware({ log = console } = {}) {
  return function deprecationNotice(req, res, next) {
    const entry = matchDeprecation(req.method, req.path);

    if (entry) {
      const deprecationDate = new Date(entry.deprecatedAt).toUTCString();
      const sunsetDate = new Date(entry.removedAt).toUTCString();

      res.setHeader('Deprecation', deprecationDate);
      res.setHeader('Sunset', sunsetDate);
      res.setHeader(
        'Link',
        `<${entry.replacement}>; rel="successor-version"`,
      );

      log.warn?.(
        `deprecated_endpoint_hit method=${req.method} path=${req.path} ` +
        `deprecated_at=${entry.deprecatedAt} removed_at=${entry.removedAt} ` +
        `replacement=${entry.replacement}`,
      );
    }

    next();
  };
}
