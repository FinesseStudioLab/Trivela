// @ts-check

/**
 * @typedef {{ deprecatedAt: string, removedAt: string, replacement: string, message: string }} DeprecationEntry
 */

/**
 * Deprecation registry — maps route patterns to lifecycle metadata.
 *
 * All legacy /api/* routes are deprecated in favour of their /api/v1/* equivalents.
 * A minimum 90-day notice period applies. Add entries here before removing or
 * replacing any endpoint; the deprecationNotice middleware reads this map at
 * runtime and injects RFC 8594 Deprecation / Sunset / Link headers automatically.
 *
 * @type {Record<string, DeprecationEntry>}
 */
export const DEPRECATION_REGISTRY = {
  'GET /api/campaigns': {
    deprecatedAt: '2026-06-01',
    removedAt: '2026-09-01',
    replacement: '/api/v1/campaigns',
    message: 'Use GET /api/v1/campaigns for the versioned campaign list.',
  },
  'GET /api/campaigns/:id': {
    deprecatedAt: '2026-06-01',
    removedAt: '2026-09-01',
    replacement: '/api/v1/campaigns/:id',
    message: 'Use GET /api/v1/campaigns/:id for the versioned campaign detail.',
  },
  'POST /api/campaigns': {
    deprecatedAt: '2026-06-01',
    removedAt: '2026-09-01',
    replacement: '/api/v1/campaigns',
    message: 'Use POST /api/v1/campaigns to create campaigns.',
  },
  'PUT /api/campaigns/:id': {
    deprecatedAt: '2026-06-01',
    removedAt: '2026-09-01',
    replacement: '/api/v1/campaigns/:id',
    message: 'Use PUT /api/v1/campaigns/:id to update campaigns.',
  },
  'DELETE /api/campaigns/:id': {
    deprecatedAt: '2026-06-01',
    removedAt: '2026-09-01',
    replacement: '/api/v1/campaigns/:id',
    message: 'Use DELETE /api/v1/campaigns/:id to delete campaigns.',
  },
  'GET /api/campaigns/:id/stats': {
    deprecatedAt: '2026-06-01',
    removedAt: '2026-09-01',
    replacement: '/api/v1/campaigns/:id/stats',
    message: 'Use GET /api/v1/campaigns/:id/stats for the versioned stats endpoint.',
  },
  'GET /api/campaigns/:id/export': {
    deprecatedAt: '2026-06-01',
    removedAt: '2026-09-01',
    replacement: '/api/v1/campaigns/:id/export',
    message: 'Use GET /api/v1/campaigns/:id/export for the versioned export endpoint.',
  },
};
