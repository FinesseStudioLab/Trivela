// @ts-check

/**
 * Deprecation registry — maps route patterns to lifecycle metadata.
 * Add entries here before removing or replacing any endpoint.
 *
 * @type {Record<string, { deprecatedAt: string, removedAt: string, replacement: string, message: string }>}
 */
export const DEPRECATION_REGISTRY = {
  // Example — uncomment when real deprecations land:
  // 'GET /api/v1/campaigns/:id/stats': {
  //   deprecatedAt: '2024-09-01',
  //   removedAt: '2024-12-01',
  //   replacement: '/api/v1/campaigns/:id/analytics',
  //   message: 'Use the /analytics endpoint for richer campaign stats.',
  // },
};
