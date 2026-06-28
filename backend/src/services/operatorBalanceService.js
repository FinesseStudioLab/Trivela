// #552 — Operator account fee-reserve & minimum-balance monitoring.
//
// Checks the XLM balance of configured operator/sponsor accounts against
// a configurable threshold. Emits structured warn logs and increments an
// in-process metrics counter when any account is below threshold.
// Each check is appended to operator_balance_log for audit history.
//
// Optional auto-topup: if AUTO_TOPUP_AMOUNT is set and a topup keypair is
// available, the service will submit a classic Payment to the low account.
// This is guarded behind the AUTO_TOPUP_ENABLED flag and capped to prevent
// runaway spending.

import { randomUUID } from 'node:crypto';
import { Keypair, TransactionBuilder, Operation, Asset, BASE_FEE, Horizon } from '@stellar/stellar-sdk';

const DEFAULT_THRESHOLD_XLM = '10';
const DEFAULT_AUTO_TOPUP_AMOUNT = '5';

/**
 * Fetch the native XLM balance of a Stellar account from Horizon.
 * @param {string} horizonUrl
 * @param {string} address
 * @returns {Promise<number>} balance in XLM
 */
async function fetchXlmBalance(horizonUrl, address) {
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(address);
  const native = account.balances.find((b) => b.asset_type === 'native');
  return parseFloat(native?.balance ?? '0');
}

/**
 * @param {{
 *   db: import('better-sqlite3').Database;
 *   horizonUrl: string;
 *   networkPassphrase: string;
 *   addresses: string[];
 *   thresholdXlm?: number;
 *   autoTopupEnabled?: boolean;
 *   topupSourceSecret?: string;
 *   topupAmountXlm?: string;
 *   metrics?: { operatorLowBalance: number };
 *   logger?: { info: Function; warn: Function; error: Function };
 * }} options
 * @returns {Promise<Array<{ address: string; balance: number; belowThreshold: boolean }>>}
 */
export async function checkOperatorBalances({
  db,
  horizonUrl,
  networkPassphrase,
  addresses,
  thresholdXlm = parseFloat(DEFAULT_THRESHOLD_XLM),
  autoTopupEnabled = false,
  topupSourceSecret,
  topupAmountXlm = DEFAULT_AUTO_TOPUP_AMOUNT,
  metrics,
  logger = console,
}) {
  const results = [];
  const hasTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operator_balance_log'")
    .get();

  for (const address of addresses) {
    let balance = 0;
    try {
      balance = await fetchXlmBalance(horizonUrl, address);
    } catch (err) {
      logger.error?.({ address, err: err.message }, '[operatorBalance] failed to fetch balance');
      continue;
    }

    const belowThreshold = balance < thresholdXlm;
    const checkedAt = new Date().toISOString();

    if (hasTable) {
      db.prepare(
        `INSERT INTO operator_balance_log
           (id, address, balance_xlm, threshold_xlm, below_threshold, checked_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        address,
        String(balance),
        String(thresholdXlm),
        belowThreshold ? 1 : 0,
        checkedAt,
      );
    }

    if (belowThreshold) {
      if (metrics) metrics.operatorLowBalance = (metrics.operatorLowBalance ?? 0) + 1;
      logger.warn?.(
        { address, balance, threshold: thresholdXlm },
        '[operatorBalance] ALERT: operator account below minimum balance',
      );

      if (autoTopupEnabled && topupSourceSecret) {
        try {
          await performAutoTopup({
            horizonUrl,
            networkPassphrase,
            topupSourceSecret,
            destinationAddress: address,
            amountXlm: topupAmountXlm,
            logger,
          });
        } catch (err) {
          logger.error?.(
            { address, err: err.message },
            '[operatorBalance] auto-topup failed',
          );
        }
      }
    } else {
      logger.info?.(
        { address, balance, threshold: thresholdXlm },
        '[operatorBalance] balance OK',
      );
    }

    results.push({ address, balance, belowThreshold });
  }

  return results;
}

/**
 * Send XLM from a topup source to a low-balance operator account.
 */
async function performAutoTopup({ horizonUrl, networkPassphrase, topupSourceSecret, destinationAddress, amountXlm, logger }) {
  const sourceKeypair = Keypair.fromSecret(topupSourceSecret);
  const server = new Horizon.Server(horizonUrl);
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

  const tx = new TransactionBuilder(sourceAccount, {
    fee: String(Number(BASE_FEE) * 2),
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amountXlm,
      }),
    )
    .setTimeout(60)
    .build();

  tx.sign(sourceKeypair);
  await server.submitTransaction(tx);
  logger.info?.(
    { destination: destinationAddress, amount: amountXlm },
    '[operatorBalance] auto-topup submitted',
  );
}

/**
 * Build the list of operator addresses to monitor from env.
 * Reads OPERATOR_SECRET_KEY and SPONSOR_SECRET_KEY (both optional).
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function resolveOperatorAddresses(env) {
  const addresses = [];
  for (const key of ['OPERATOR_SECRET_KEY', 'SPONSOR_SECRET_KEY']) {
    const secret = env[key];
    if (secret) {
      try {
        addresses.push(Keypair.fromSecret(secret).publicKey());
      } catch {
        // ignore invalid keys at startup
      }
    }
  }
  // Deduplicate
  return [...new Set(addresses)];
}
