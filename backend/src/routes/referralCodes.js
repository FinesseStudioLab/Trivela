// @ts-check
import express from 'express';
import { generateReferralCode, buildReferralLink } from '../services/referralCodeService.js';

/**
 * Referral code generator for partner Twitter influencers.
 *
 * Endpoints:
 *   POST /referral-codes          — generate a code + link for an influencer name/handle
 *   GET  /referral-codes/:code    — resolve a code to its public referral link
 */
export function createReferralCodeRoutes() {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { influencerName, handle } = req.body ?? {};
    const name = influencerName ?? handle;
    if (!name || typeof name !== 'string') {
      return res
        .status(400)
        .json({ error: 'influencerName (or handle) is required and must be a string' });
    }

    try {
      const { code, link } = generateReferralCode(name);
      return res.status(201).json({ code, link, influencerName: name });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid name' });
    }
  });

  router.get('/:code', (req, res) => {
    const code = String(req.params.code ?? '');
    if (!/^[a-z0-9-]{1,64}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid referral code' });
    }
    return res.json({ code, link: buildReferralLink(code) });
  });

  return router;
}
