/**
 * Social task verification routes (#1243).
 *
 * POST /social-tasks/twitter/verify
 *   body: { username: string, task: { type: 'tweet', text } |
 *                                  { type: 'like' | 'retweet', tweetId } |
 *                                  { type: 'follow', targetUsername } }
 *
 * Returns { verified, type, username, userId?, reason? }. Points must only be
 * awarded when `verified` is true; this route never trusts the client's claim
 * that a task was done — every check goes to the Twitter API v2.
 *
 * Errors: 400 invalid input, 429 Twitter rate limit (with Retry-After),
 * 502 Twitter unavailable / credentials rejected, 503 not configured.
 */

import { Router } from 'express';
import { SocialVerificationError } from '../services/twitterVerificationService.js';

/**
 * @param {{
 *   twitterVerificationService: ReturnType<import('../services/twitterVerificationService.js').createTwitterVerificationService>,
 *   requireApiKey?: import('express').RequestHandler,
 * }} deps
 * @returns {import('express').Router}
 */
export function createSocialTaskRoutes({ twitterVerificationService, requireApiKey }) {
  const router = Router();

  router.post('/twitter/verify', ...(requireApiKey ? [requireApiKey] : []), async (req, res, next) => {
    try {
      const { username, task } = req.body ?? {};
      const result = await twitterVerificationService.verifyTask({ username, task });
      return res.json(result);
    } catch (err) {
      if (err instanceof SocialVerificationError) {
        if (err.retryAfterSeconds !== undefined) {
          res.set('Retry-After', String(err.retryAfterSeconds));
        }
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      return next(err);
    }
  });

  return router;
}
