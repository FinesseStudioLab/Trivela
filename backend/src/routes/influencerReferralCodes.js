// @ts-check
import { Router } from 'express';
import { InfluencerCodeError } from '../services/influencerReferralCodes.js';

/**
 * Influencer referral code routes.
 *
 *   POST  /referral-codes              (auth) { handle, campaignId? } -> 201 code + referralUrl
 *   GET   /referral-codes              (auth) list codes with click counts
 *   PATCH /referral-codes/:code        (auth) { active: boolean }
 *   GET   /referral-codes/:code        (public) resolve a code for /ref/:code landing; counts a click
 *
 * @param {{
 *   service: ReturnType<import('../services/influencerReferralCodes.js').createInfluencerReferralService>,
 *   requireApiKey?: import('express').RequestHandler | import('express').RequestHandler[],
 * }} deps
 */
export function createInfluencerReferralRoutes({ service, requireApiKey }) {
  const router = Router();
  const auth = requireApiKey ? (Array.isArray(requireApiKey) ? requireApiKey : [requireApiKey]) : [];

  /** @param {any} err @param {import('express').Response} res @param {import('express').NextFunction} next */
  const handleError = (err, res, next) => {
    if (err instanceof InfluencerCodeError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return next(err);
  };

  router.post('/referral-codes', ...auth, (req, res, next) => {
    try {
      const { handle, campaignId } = req.body ?? {};
      return res.status(201).json(service.generate({ handle, campaignId }));
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  router.get('/referral-codes', ...auth, (_req, res) => {
    res.json({ data: service.list() });
  });

  router.patch('/referral-codes/:code', ...auth, (req, res, next) => {
    try {
      if (typeof req.body?.active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean', code: 'INVALID_INPUT' });
      }
      return res.json(service.setActive(req.params.code, req.body.active));
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  router.get('/referral-codes/:code', (req, res) => {
    const record = service.resolve(req.params.code);
    if (!record) {
      return res.status(404).json({ error: 'referral code not found', code: 'CODE_NOT_FOUND' });
    }
    return res.json({
      code: record.code,
      influencerHandle: record.influencerHandle,
      campaignId: record.campaignId,
      referralUrl: record.referralUrl,
    });
  });

  return router;
}
