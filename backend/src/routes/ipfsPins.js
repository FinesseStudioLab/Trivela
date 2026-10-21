// @ts-check
import { Router } from 'express';

/** Durable-queue job type that pins a campaign in the background. */
export const IPFS_PIN_JOB_TYPE = 'ipfs_pin_campaign';

/**
 * IPFS pinning endpoints (#1255).
 *
 *   POST /campaigns/:id/ipfs-pins   pin the campaign's image, rules, badge and metadata
 *   GET  /campaigns/:id/ipfs-pins   list stored pins
 *
 * @param {{
 *   getService: () => ReturnType<import('../services/ipfsPinService.js').createIpfsPinService> | null,
 *   campaignRepository: { getById: (id: string) => any },
 *   guard?: import('express').RequestHandler[],
 * }} options
 */
export function createIpfsPinRoutes({ getService, campaignRepository, guard = [] }) {
  const router = Router();

  router.post('/campaigns/:id/ipfs-pins', ...guard, async (req, res) => {
    const service = getService();
    if (!service) {
      return res
        .status(503)
        .json({ error: 'IPFS pinning is not configured', code: 'IPFS_PIN_NOT_CONFIGURED' });
    }
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' });

    try {
      const result = await service.pinCampaign(campaign);
      return res.status(201).json(result);
    } catch (err) {
      return res.status(502).json({
        error: `Pinning failed: ${err instanceof Error ? err.message : String(err)}`,
        code: 'IPFS_PIN_FAILED',
      });
    }
  });

  router.get('/campaigns/:id/ipfs-pins', ...guard, (req, res) => {
    const service = getService();
    if (!campaignRepository.getById(req.params.id)) {
      return res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' });
    }
    const data = service ? service.list(req.params.id) : [];
    return res.json({ data, total: data.length, configured: Boolean(service) });
  });

  return router;
}
