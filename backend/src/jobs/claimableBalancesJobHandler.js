// #922 — Durable-queue job handler for end-of-campaign claimable balance
// creation. Wraps createClaimableBalancesForCampaign so on-chain submission
// runs off the request thread with the durable queue's retry/backoff/DLQ
// machinery, instead of blocking POST /campaigns/:id/claimable-balances.

import { createClaimableBalancesForCampaign } from './claimableBalancesJob.js';

export const CLAIMABLE_BALANCES_JOB_TYPE = 'claimable-balances:create';

/**
 * @param {{
 *   dal: { db: import('better-sqlite3').Database };
 *   stellarConfig: { networkPassphrase: string; horizonUrl: string };
 *   env?: NodeJS.ProcessEnv;
 *   log?: Pick<Console, 'info' | 'warn' | 'error'>;
 * }} deps
 */
export function createClaimableBalancesJobHandler({
  dal,
  stellarConfig,
  env = process.env,
  log = console,
}) {
  /**
   * @param {{
   *   jobId: string;
   *   campaignId: string;
   *   campaignEndDate: string;
   *   assetCode?: string;
   *   assetIssuer?: string;
   *   graceDays?: number;
   * }} payload
   */
  return async function handleClaimableBalances(payload) {
    const { jobId, campaignId, campaignEndDate, assetCode, assetIssuer, graceDays } = payload;

    log.info?.(`claimableBalancesJob:start jobId=${jobId} campaignId=${campaignId}`);

    const result = await createClaimableBalancesForCampaign({
      db: dal.db,
      campaignId: String(campaignId),
      campaignEndDate: new Date(campaignEndDate),
      assetCode,
      assetIssuer,
      graceDays,
      stellarConfig,
      operatorSecretKey: env.OPERATOR_SECRET_KEY,
      logger: log,
    });

    log.info?.(
      `claimableBalancesJob:done jobId=${jobId} campaignId=${campaignId} created=${result.created} skipped=${result.skipped} failed=${result.failed}`,
    );

    // createClaimableBalancesForCampaign is per-user and idempotent (it only
    // (re)attempts rows that aren't already 'pending'/'created'), so it's
    // safe to let a real submission failure bubble up here: the durable
    // queue's retry/backoff will re-run the whole job, and previously
    // successful rows are skipped on the next pass.
    if (result.failed > 0) {
      throw new Error(
        `claimableBalancesJob: ${result.failed} submission(s) failed for campaign=${campaignId}`,
      );
    }
  };
}
