import { Router } from 'express';
import { buildCampaignStats } from '../services/campaignStatsService.js';

export function createCampaignRoutes({ campaignRepository, referralRepository, indexerCursor }) {
  const router = Router();

  router.get('/:id/stats', async (req, res, next) => {
    try {
      const { id } = req.params;
      const campaign = campaignRepository.getById(id);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const stats = buildCampaignStats({
        db: campaignRepository.db,
        campaign,
        referralRepository,
        indexerCursor,
        query: req.query,
      });

      res.json({
        campaignId: stats.campaignId,
        onChainSynced: stats.onChainSynced,
        range: stats.range,
        summary: stats.summary,
        registrationsByDay: stats.registrationsByDay,
        pointsByDay: stats.pointsByDay,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
