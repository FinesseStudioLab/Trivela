/**
 * Daily streak and login reward routes (#947).
 *
 * POST /streaks/:identity/activity  — record a login/activity event
 * GET  /streaks/:identity           — read current streak (read-only)
 * DELETE /streaks/:identity         — admin reset of a streak
 */

import { Router } from 'express';

/**
 * @param {{
 *   streakService: ReturnType<import('../services/streakService.js').createStreakService>,
 *   requireApiKey?: import('express').RequestHandler,
 *   requireMasterKey?: import('express').RequestHandler,
 * }} deps
 * @returns {import('express').Router}
 */
export function createStreakRoutes({ streakService, requireApiKey, requireMasterKey }) {
  const router = Router();

  // POST /streaks/:identity/activity
  // Called once per session (e.g., on login or on campaign participation).
  // Idempotent within the same UTC day: repeated calls return alreadyCredited=true.
  router.post('/:identity/activity', ...(requireApiKey ? [requireApiKey] : []), (req, res) => {
    const { identity } = req.params;
    if (!identity || typeof identity !== 'string' || !identity.trim()) {
      return res.status(400).json({ error: 'identity is required', code: 'VALIDATION_ERROR' });
    }

    const result = streakService.recordActivity(identity.trim());

    return res.status(result.alreadyCredited ? 200 : 201).json({
      identity,
      streakDays: result.streakDays,
      pointsEarned: result.pointsEarned,
      totalPoints: result.totalPoints,
      alreadyCredited: result.alreadyCredited,
    });
  });

  // GET /streaks/:identity
  router.get('/:identity', ...(requireApiKey ? [requireApiKey] : []), (req, res) => {
    const record = streakService.getStreak(req.params.identity.trim());
    if (!record) {
      return res.json({
        identity: req.params.identity,
        streakDays: 0,
        totalPoints: 0,
        lastActivityDate: null,
      });
    }
    return res.json({ identity: req.params.identity, ...record });
  });

  // DELETE /streaks/:identity — admin-only, resets a user's streak
  router.delete('/:identity', ...(requireMasterKey ? [requireMasterKey] : []), (req, res) => {
    streakService.resetStreak(req.params.identity.trim());
    return res.status(204).end();
  });

  return router;
}
