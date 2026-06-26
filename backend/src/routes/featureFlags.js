// @ts-check
import express from 'express';

/**
 * @param {{ featureFlagService: ReturnType<import('../services/featureFlagService.js').createFeatureFlagService> }} deps
 */
export function createFeatureFlagRoutes({ featureFlagService }) {
  const router = express.Router();

  // Hydrate client with all flags (evaluated values not stored rules)
  router.get('/', (_req, res) => {
    const flags = featureFlagService.getAllFlags();
    // Return a simple key→enabled map safe to expose to the client
    const map = Object.fromEntries(flags.map((f) => [f.flagKey, f.enabled]));
    res.json({ flags: map });
  });

  // Evaluate a single flag for a given context
  router.get('/:key', (req, res) => {
    const { key } = req.params;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
    const enabled = featureFlagService.isEnabled(key, { userId, orgId });
    res.json({ flagKey: key, enabled });
  });

  // Admin: create or update a flag
  router.post('/', (req, res) => {
    const { flagKey, enabled, targeting, description } = req.body ?? {};
    if (!flagKey || typeof flagKey !== 'string') {
      return res.status(400).json({ error: 'flagKey is required' });
    }
    const flag = featureFlagService.setFlag({
      flagKey,
      enabled: Boolean(enabled),
      targeting: targeting ?? {},
      description: description ?? null,
    });
    res.status(201).json(flag);
  });

  // Admin: delete a flag (kill-switch removal)
  router.delete('/:key', (req, res) => {
    const deleted = featureFlagService.deleteFlag(req.params.key);
    if (!deleted) return res.status(404).json({ error: 'Flag not found' });
    res.status(204).end();
  });

  return router;
}
