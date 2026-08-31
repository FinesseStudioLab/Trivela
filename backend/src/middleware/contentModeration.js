/**
 * Content moderation middleware for campaign create/update.
 *
 * Checks name, description, and tags against the configured moderation
 * provider. Admin (master-key) requests may pass `override_moderation: true`
 * in the body to skip the check.
 */

/**
 * @param {{
 *   moderationService: import('../moderation/moderationService.js').ReturnType<typeof import('../moderation/moderationService.js').createModerationService>,
 *   log: import('../middleware/logger.js').Logger,
 * }} options
 */
export function createContentModerationMiddleware({ moderationService, log }) {
  return async function contentModerationMiddleware(req, res, next) {
    // Env-sourced API keys are operator-level (equivalent to admin); allow override.
    if (req.body?.override_moderation === true && req.auth?.source === 'env') {
      return next();
    }

    const { name, description, tags } = req.body ?? {};

    try {
      const result = await moderationService.check({ name, description, tags });

      if (result.flagged) {
        const campaignId = req.params?.id ?? 'new';
        log.info({ campaignId, categories: result.categories }, 'Content moderation flag');
        return res.status(422).json({
          error: 'Content violates community guidelines',
          categories: result.categories,
        });
      }

      return next();
    } catch (err) {
      log.warn({ err }, 'Content moderation check failed, allowing request through');
      return next();
    }
  };
}
