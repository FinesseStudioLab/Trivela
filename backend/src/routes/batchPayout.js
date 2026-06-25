// @ts-check
import { Router } from 'express';

/**
 * @param {{
 *   batchPayoutService: ReturnType<import('../services/batchPayoutService.js').createBatchPayoutService>,
 *   requireMasterKey: import('express').RequestHandler | import('express').RequestHandler[],
 *   rateLimiter: import('express').RequestHandler,
 *   log?: { info?: Function, warn?: Function, error?: Function },
 * }} deps
 * @returns {import('express').Router}
 */
export function createBatchPayoutRouter({ batchPayoutService, requireMasterKey, rateLimiter, log = console }) {
  const router = Router();
  const guard = Array.isArray(requireMasterKey) ? requireMasterKey : [requireMasterKey];

  /**
   * POST /admin/batch-payout
   *
   * Enqueue a batch payout. If batchId is provided and already exists the
   * existing job is returned unchanged (idempotent).
   *
   * Body: { batchId?, from, recipients: [{address, amount}], campaignId?, maxOpsPerTx?, continueOnError? }
   */
  router.post('/admin/batch-payout', rateLimiter, ...guard, (req, res) => {
    const { batchId, from, recipients, campaignId, maxOpsPerTx, continueOnError } = req.body ?? {};

    try {
      const result = batchPayoutService.enqueueBatch({
        batchId,
        from,
        recipients,
        campaignId: campaignId ?? null,
        maxOpsPerTx: maxOpsPerTx != null ? Number(maxOpsPerTx) : undefined,
        continueOnError: continueOnError !== false,
      });

      const job = batchPayoutService.getBatch(result.batchId);
      const status = result.created ? 201 : 200;
      return res.status(status).json({ batchId: result.batchId, created: result.created, job });
    } catch (err) {
      if (err?.code === 'VALIDATION_ERROR') {
        return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
      }
      log.error?.({ err }, 'batch_payout: enqueue failed');
      return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * POST /admin/batch-payout/:batchId/execute
   *
   * Trigger execution of a pending batch.
   */
  router.post('/admin/batch-payout/:batchId/execute', rateLimiter, ...guard, async (req, res) => {
    const { batchId } = req.params;
    try {
      const job = await batchPayoutService.executeBatch(batchId);
      return res.json({ job });
    } catch (err) {
      if (err?.code === 'NOT_FOUND') {
        return res.status(404).json({ error: `Batch ${batchId} not found`, code: 'NOT_FOUND' });
      }
      if (err?.code === 'CONFLICT') {
        return res.status(409).json({ error: err.message, code: 'CONFLICT' });
      }
      log.error?.({ err, batchId }, 'batch_payout: execute failed');
      return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  /**
   * GET /admin/batch-payout/:batchId
   *
   * Get the current status of a batch payout job.
   */
  router.get('/admin/batch-payout/:batchId', rateLimiter, ...guard, (req, res) => {
    const { batchId } = req.params;
    const job = batchPayoutService.getBatch(batchId);
    if (!job) {
      return res.status(404).json({ error: `Batch ${batchId} not found`, code: 'NOT_FOUND' });
    }
    return res.json({ job });
  });

  return router;
}
