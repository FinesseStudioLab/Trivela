// @ts-check
import { Router } from 'express';
import { FLAG_STATUSES } from '../services/fraudDetection.js';

/**
 * Admin review API for fraud flags (#1258). Mount behind the master key.
 *
 *   GET   /flags?status=&campaignId=&limit=&offset=
 *   PATCH /flags/:id   { status: 'open' | 'dismissed' | 'confirmed' }
 *
 * @param {{
 *   fraudDetector: ReturnType<import('../services/fraudDetection.js').createFraudDetector>,
 *   recordAudit?: (req: import('express').Request, entry: object) => void,
 * }} options
 */
export function createFraudFlagRoutes({ fraudDetector, recordAudit }) {
  const router = Router();

  router.get('/flags', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !FLAG_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${FLAG_STATUSES.join(', ')}`,
        code: 'VALIDATION_ERROR',
      });
    }
    const result = fraudDetector.listFlags({
      status,
      campaignId: typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined,
      limit: Number.parseInt(String(req.query.limit ?? ''), 10) || 50,
      offset: Number.parseInt(String(req.query.offset ?? ''), 10) || 0,
    });
    return res.json(result);
  });

  router.patch('/flags/:id', (req, res) => {
    const status = req.body?.status;
    if (!FLAG_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${FLAG_STATUSES.join(', ')}`,
        code: 'VALIDATION_ERROR',
      });
    }
    const flag = fraudDetector.updateFlagStatus(Number(req.params.id), status);
    if (!flag) return res.status(404).json({ error: 'Flag not found', code: 'NOT_FOUND' });

    recordAudit?.(req, {
      action: 'fraud.flag.updated',
      entity: 'fraud_flag',
      entityId: String(flag.id),
      diff: { status },
    });
    return res.json(flag);
  });

  return router;
}
