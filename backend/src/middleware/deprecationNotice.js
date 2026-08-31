// @ts-check
import { DEPRECATION_REGISTRY } from '../deprecations.js';

/**
 * @typedef {{ deprecatedAt: string, removedAt: string, replacement: string, message: string }} DeprecationEntry
 */

/**
 * Match a request path+method against a deprecation registry.
 * Registry keys are like "GET /api/v1/campaigns/:id/stats"; path segments
 * starting with ":" are treated as wildcards.
 *
 * @param {string} method  e.g. "GET"
 * @param {string} path    e.g. "/api/v1/campaigns/42/stats"
 * @param {Record<string, DeprecationEntry>} registry
 * @returns {DeprecationEntry | null}
 */
function matchDeprecation(method, path, registry) {
  for (const [pattern, entry] of Object.entries(registry)) {
    const [patternMethod, ...rest] = pattern.split(' ');
    const patternPath = rest.join(' ');

    if (patternMethod.toUpperCase() !== method.toUpperCase()) continue;

    const patternParts = patternPath.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const matched = patternParts.every((seg, i) => seg.startsWith(':') || seg === pathParts[i]);

    if (matched) return entry;
  }
  return null;
}

/**
 * Express middleware that injects RFC 8594 deprecation headers for
 * any route registered in the deprecation registry, and WARN-logs usage
 * so operators know which deprecated endpoints are still being hit.
 *
 * @param {{ log?: { warn?: Function }, registry?: Record<string, DeprecationEntry> }} [options]
 * @returns {import('express').RequestHandler}
 */
export function createDeprecationMiddleware({
  log = console,
  registry = DEPRECATION_REGISTRY,
} = {}) {
  return function deprecationNotice(req, res, next) {
    const entry = matchDeprecation(req.method, req.path, registry);

    if (entry) {
      const deprecationDate = new Date(entry.deprecatedAt).toUTCString();
      const sunsetDate = new Date(entry.removedAt).toUTCString();

      res.setHeader('Deprecation', deprecationDate);
      res.setHeader('Sunset', sunsetDate);
      res.setHeader('Link', `<${entry.replacement}>; rel="successor-version"`);

      log.warn?.(
        `deprecated_endpoint_hit method=${req.method} path=${req.path} ` +
          `deprecated_at=${entry.deprecatedAt} removed_at=${entry.removedAt} ` +
          `replacement=${entry.replacement}`,
      );
    }

    next();
  };
}
