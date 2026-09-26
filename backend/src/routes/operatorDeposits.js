// @ts-check
import { Router } from 'express';

/**
 * Read API over deposits seen by the Horizon watcher (#1261). Mount behind the
 * master key: it exposes custody-account activity.
 *
 *   GET /deposits?account=&limit=&beforeId=   recent deposits
 *   GET /deposits/:txHash                     verify a deposit by transaction hash
 *   GET /watcher/status                       stream health, cursors and counters
 *
 * @param {{ watcher: ReturnType<import('../services/horizonDepositWatcher.js').createHorizonDepositWatcher> }} options
 */
export function createOperatorDepositRoutes({ watcher }) {
  const router = Router();

  router.get('/deposits', (req, res) => {
    const data = watcher.listDeposits({
      account: typeof req.query.account === 'string' ? req.query.account : undefined,
      limit: Number.parseInt(String(req.query.limit ?? ''), 10) || 50,
      beforeId: Number.parseInt(String(req.query.beforeId ?? ''), 10) || undefined,
    });
    res.json({ data, total: data.length });
  });

  router.get('/deposits/:txHash', (req, res) => {
    const deposits = watcher.getByTxHash(req.params.txHash);
    if (deposits.length === 0) {
      return res.status(404).json({ error: 'Deposit not found', code: 'NOT_FOUND' });
    }
    return res.json({
      txHash: req.params.txHash,
      verified: deposits.every((d) => d.verified),
      deposits,
    });
  });

  router.get('/watcher/status', (_req, res) => {
    res.json(watcher.getStatus());
  });

  return router;
}
