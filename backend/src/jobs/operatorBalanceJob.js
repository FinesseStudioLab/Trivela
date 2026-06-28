// #552 — Periodic operator balance check job.
// Runs every OPERATOR_BALANCE_CHECK_INTERVAL_MS (default: 5 minutes).
// Alerts via log.warn + metrics when any account is below threshold.

import { checkOperatorBalances, resolveOperatorAddresses } from '../services/operatorBalanceService.js';

const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @param {{
 *   db: import('better-sqlite3').Database;
 *   stellarConfig: { horizonUrl: string; networkPassphrase: string };
 *   metrics?: { operatorLowBalance: number };
 *   env?: NodeJS.ProcessEnv;
 *   logger?: { info: Function; warn: Function; error: Function };
 * }} options
 * @returns {{ start: () => void; stop: () => void; runOnce: () => Promise<void> }}
 */
export function createOperatorBalanceJob({ db, stellarConfig, metrics, env = process.env, logger = console }) {
  const intervalMs = Number(env.OPERATOR_BALANCE_CHECK_INTERVAL_MS ?? DEFAULT_CHECK_INTERVAL_MS);
  const thresholdXlm = parseFloat(env.OPERATOR_BALANCE_THRESHOLD_XLM ?? '10');
  const autoTopupEnabled = env.AUTO_TOPUP_ENABLED === 'true';
  const topupSourceSecret = env.TOPUP_SOURCE_SECRET_KEY;
  const topupAmountXlm = env.TOPUP_AMOUNT_XLM ?? '5';

  let timer = null;

  async function runOnce() {
    const addresses = resolveOperatorAddresses(env);
    if (addresses.length === 0) {
      logger.info?.('[operatorBalanceJob] no operator addresses configured, skipping');
      return;
    }
    await checkOperatorBalances({
      db,
      horizonUrl: stellarConfig.horizonUrl,
      networkPassphrase: stellarConfig.networkPassphrase,
      addresses,
      thresholdXlm,
      autoTopupEnabled,
      topupSourceSecret,
      topupAmountXlm,
      metrics,
      logger,
    });
  }

  function start() {
    timer = setInterval(async () => {
      try {
        await runOnce();
      } catch (err) {
        logger.error?.({ err: err.message }, '[operatorBalanceJob] unexpected error');
      }
    }, intervalMs);
    // Don't block startup — run after a short delay
    setTimeout(() => runOnce().catch((err) => {
      logger.error?.({ err: err.message }, '[operatorBalanceJob] initial check failed');
    }), 5_000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { start, stop, runOnce };
}
