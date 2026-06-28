// #548 — REST endpoints for claimable balance management.

import { Router } from 'express';
import { createClaimableBalancesForCampaign } from '../jobs/claimableBalancesJob.js';

/**
 * @param {{
 *   dal: import('../dal/index.js').Dal;
 *   campaignRepository: { getById: Function };
 *   stellarConfig: { networkPassphrase: string; horizonUrl: string };
 *   env?: NodeJS.ProcessEnv;
 *   logger?: { info: Function; warn: Function; error: Function };
 * }} options
 */
export function createClaimableBalancesRoutes({
  dal,
  campaignRepository,
  stellarConfig,
  env = process.env,
  logger = console,
}) {
  const router = Router();

  // POST /campaigns/:id/claimable-balances — trigger claimable balance creation on campaign end
  router.post('/campaigns/:id/claimable-balances', async (req, res) => {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'campaign not found' });

    const graceDays = Number(req.body?.graceDays ?? env.CLAIMABLE_GRACE_DAYS ?? 30);
    const assetCode = req.body?.assetCode ?? env.REWARD_TOKEN_CODE ?? 'XLM';
    const assetIssuer = req.body?.assetIssuer ?? env.REWARD_TOKEN_ISSUER ?? undefined;
    const campaignEndDate = campaign.endDate ? new Date(campaign.endDate) : new Date();

    const result = await createClaimableBalancesForCampaign({
      db: dal.db,
      campaignId: String(campaign.id),
      campaignEndDate,
      assetCode,
      assetIssuer,
      graceDays,
      stellarConfig,
      operatorSecretKey: env.OPERATOR_SECRET_KEY,
      logger,
    });

    return res.status(202).json({ ok: true, campaignId: String(campaign.id), ...result });
  });

  // GET /campaigns/:id/claimable-balances — list claimable balances for a campaign
  router.get('/campaigns/:id/claimable-balances', (req, res) => {
    const hasTable = dal.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='claimable_balances'")
      .get();
    if (!hasTable) return res.json({ data: [], total: 0 });

    const campaignId = req.params.id;
    const status = req.query.status;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    let query = 'SELECT * FROM claimable_balances WHERE campaign_id = ?';
    const params = [campaignId];
    if (status) { query += ' AND status = ?'; params.push(status); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = dal.db.prepare(query).all(...params);
    const total = dal.db
      .prepare('SELECT COUNT(*) as cnt FROM claimable_balances WHERE campaign_id = ?' + (status ? ' AND status = ?' : ''))
      .get(...(status ? [campaignId, status] : [campaignId])).cnt;

    return res.json({ data: rows, total, limit, offset });
  });

  // POST /campaigns/:id/claimable-balances/reclaim — operator reclaims after grace window
  router.post('/campaigns/:id/claimable-balances/reclaim', async (req, res) => {
    const hasTable = dal.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='claimable_balances'")
      .get();
    if (!hasTable) return res.status(503).json({ error: 'claimable balances table not migrated' });

    const campaignId = req.params.id;
    const now = new Date().toISOString();

    // Find balances past their grace window that haven't been claimed or reclaimed yet
    const reclaimable = dal.db
      .prepare(
        `SELECT * FROM claimable_balances
         WHERE campaign_id = ? AND status = 'created' AND grace_end_at <= ?`,
      )
      .all(campaignId, now);

    if (reclaimable.length === 0) {
      return res.json({ reclaimed: 0, message: 'no reclaimable balances found' });
    }

    // Mark as reclaimed (on-chain claim by operator is done separately via Horizon SDK)
    const stmt = dal.db.prepare(
      "UPDATE claimable_balances SET status = 'reclaimed_by_operator', updated_at = ? WHERE id = ?",
    );
    for (const row of reclaimable) {
      stmt.run(now, row.id);
    }

    return res.json({ reclaimed: reclaimable.length, balanceIds: reclaimable.map((r) => r.balance_id) });
  });

  return router;
}
