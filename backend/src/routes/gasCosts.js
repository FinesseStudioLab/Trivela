// @ts-check
import { Router } from 'express';

/**
 * Read API over contract-interaction fees recorded by the gas cost monitor
 * (#1266). Mount behind the master key: it exposes submitter account activity.
 *
 *   GET /summary?since=&until=&contractId=         totals, averages, percentiles
 *   GET /daily?days=&contractId=                   per-day (UTC) totals
 *   GET /transactions?contractId=&limit=&beforeId= recent recorded fees
 *   GET /status                                    worker health and counters
 *
 * @param {{ monitor: ReturnType<import('../services/gasCostMonitor.js').createGasCostMonitor> }} options
 */
export function createGasCostRoutes({ monitor }) {
  const router = Router();

  /**
   * Validate an optional ISO-8601 timestamp query param and normalise it.
   * @param {unknown} value
   * @returns {{ ok: true, value: string | undefined } | { ok: false }}
   */
  function parseTimestamp(value) {
    if (value === undefined || value === '') return { ok: true, value: undefined };
    if (typeof value !== 'string') return { ok: false };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { ok: false };
    return { ok: true, value: date.toISOString() };
  }

  /** @param {unknown} value */
  function parseContractId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
  }

  router.get('/summary', (req, res) => {
    const since = parseTimestamp(req.query.since);
    const until = parseTimestamp(req.query.until);
    if (!since.ok || !until.ok) {
      return res
        .status(400)
        .json({ error: 'since/until must be ISO-8601 timestamps', code: 'VALIDATION_ERROR' });
    }
    if (since.value && until.value && since.value >= until.value) {
      return res.status(400).json({ error: 'since must be before until', code: 'VALIDATION_ERROR' });
    }
    return res.json(
      monitor.getSummary({
        since: since.value,
        until: until.value,
        contractId: parseContractId(req.query.contractId),
      }),
    );
  });

  router.get('/daily', (req, res) => {
    const data = monitor.getDailyBreakdown({
      days: Number.parseInt(String(req.query.days ?? ''), 10) || 30,
      contractId: parseContractId(req.query.contractId),
    });
    res.json({ data, total: data.length });
  });

  router.get('/transactions', (req, res) => {
    const data = monitor.listTransactions({
      contractId: parseContractId(req.query.contractId),
      limit: Number.parseInt(String(req.query.limit ?? ''), 10) || 50,
      beforeId: Number.parseInt(String(req.query.beforeId ?? ''), 10) || undefined,
    });
    res.json({ data, total: data.length });
  });

  router.get('/status', (_req, res) => {
    res.json(monitor.getStatus());
  });

  return router;
}
