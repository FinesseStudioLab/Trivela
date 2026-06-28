// @ts-check
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { BatchPayoutError } from '../services/batchPayoutService.js';

/**
 * Admin API for batch payout operations.
 *
 * Routes:
 *   POST   /api/v1/batch-payouts              – register + launch a batch
 *   GET    /api/v1/batch-payouts              – list all batches
 *   GET    /api/v1/batch-payouts/:batchId     – get batch status + per-recipient detail
 *
 * @param {{
 *   batchPayoutService: ReturnType<import('../services/batchPayoutService.js').createBatchPayoutService>,
 *   requireApiKey: import('express').RequestHandler | import('express').RequestHandler[],
 *   log: Pick<Console, 'info' | 'warn' | 'error'>,
 * }} deps
 * @returns {import('express').Router}
 */
export function createBatchPayoutRouter({ batchPayoutService, requireApiKey, log }) {
  const router = Router();
  const auth = Array.isArray(requireApiKey) ? requireApiKey : [requireApiKey];

  // ── POST /api/v1/batch-payouts ─────────────────────────────────────────────
  // Register a new batch and kick off async execution.
  // Idempotent: if batchId is supplied and already exists, returns the existing
  // record without re-launching. Omit batchId to auto-generate one.

  router.post('/batch-payouts', ...auth, (req, res) => {
    const { campaignId, recipients, batchId, failMode } = req.body ?? {};

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'recipients must be a non-empty array', code: 'VALIDATION_ERROR' });
    }
    if (recipients.length > 10_000) {
      return res.status(400).json({ error: 'Maximum 10 000 recipients per batch', code: 'BATCH_TOO_LARGE' });
    }

    const id = typeof batchId === 'string' && batchId ? batchId : randomUUID();

    let batch;
    try {
      batch = batchPayoutService.registerBatch({ batchId: id, recipients, campaignId: campaignId ?? '' });
    } catch (err) {
      if (err instanceof BatchPayoutError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      log.error(err, 'batch_payout:register_error');
      return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }

    // Fire-and-forget — progress is visible via GET /batch-payouts/:batchId
    batchPayoutService.executeBatch(id).catch((err) => {
      if (err instanceof BatchPayoutError && err.code === 'ALREADY_RUNNING') return;
      log.error({ err, batchId: id }, 'batch_payout:execution_error');
    });

    return res.status(202).json({
      batchId: id,
      status: batch.status,
      totalRecipients: batch.totalRecipients,
    });
  });

  // ── GET /api/v1/batch-payouts ──────────────────────────────────────────────

  router.get('/batch-payouts', ...auth, (_req, res) => {
    const batches = batchPayoutService.listBatches().map(summaryView);
    return res.json({ batches, count: batches.length });
  });

  // ── GET /api/v1/batch-payouts/:batchId ────────────────────────────────────

  router.get('/batch-payouts/:batchId', ...auth, (req, res) => {
    const batch = batchPayoutService.getBatch(req.params.batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found', code: 'NOT_FOUND' });
    }
    return res.json({ batch });
  });

  return router;
}

/** Strip the recipient list for the summary view to keep list responses small. */
function summaryView(batch) {
  const { recipients: _r, ...rest } = batch;
  return rest;
}
