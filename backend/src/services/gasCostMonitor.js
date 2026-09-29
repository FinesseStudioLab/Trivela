// @ts-check
import { Address, FeeBumpTransaction, Horizon, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * On-chain transaction gas cost monitoring worker (#1266).
 *
 * Polls Horizon for transactions submitted by the configured submitter
 * accounts, keeps only Soroban contract interactions (invokeHostFunction), and
 * records the XLM fee actually charged for each one. Aggregates (totals,
 * averages, percentiles, per-contract and per-day breakdowns) are computed on
 * demand from the recorded rows. Poll cursors are persisted so a restart
 * resumes where the previous run stopped instead of re-scanning history.
 */

export const STROOPS_PER_XLM = 10_000_000;

const MAX_PAGE_SIZE = 200;
const MAX_LIST_LIMIT = 200;

/**
 * @typedef {{
 *   txHash: string, sourceAccount: string, feeAccount: string,
 *   contractId: string | null, functionName: string | null,
 *   feeCharged: number, maxFee: number, feeBump: boolean, successful: boolean,
 *   ledger: number | null, createdAt: string,
 * }} TxFee
 */

/**
 * @typedef {{ contractId: string | null, functionName: string | null } | null} Invocation
 */

/**
 * Convert integer stroops to a fixed 7-decimal XLM string without float drift.
 * @param {number} stroops
 */
export function stroopsToXlm(stroops) {
  const n = Math.round(Number(stroops) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / STROOPS_PER_XLM);
  const frac = String(abs % STROOPS_PER_XLM).padStart(7, '0');
  return `${sign}${whole}.${frac}`;
}

/**
 * Parse a Horizon stroop amount (string or number) into a safe non-negative
 * integer, or null when it is missing or malformed.
 * @param {unknown} value
 */
export function parseStroops(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Decode a transaction envelope and return the first contract invocation it
 * carries, or null when it has no invokeHostFunction operation.
 *
 * @param {string} envelopeXdr
 * @param {string} networkPassphrase
 * @returns {Invocation}
 */
export function decodeInvocation(envelopeXdr, networkPassphrase) {
  let tx = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  if (tx instanceof FeeBumpTransaction) tx = tx.innerTransaction;

  for (const op of tx.operations) {
    if (op.type !== 'invokeHostFunction') continue;
    const func = /** @type {any} */ (op).func;
    if (func?.switch?.().name === 'hostFunctionTypeInvokeContract') {
      const call = func.invokeContract();
      return {
        contractId: Address.fromScAddress(call.contractAddress()).toString(),
        functionName: call.functionName().toString(),
      };
    }
    // Contract upload / create are still contract interactions with a fee.
    return { contractId: null, functionName: null };
  }
  return null;
}

/**
 * Turn a Horizon transaction record into a fee row, or null when it is not a
 * contract interaction we should track.
 *
 * @param {Record<string, any>} record
 * @param {{
 *   decode: (envelopeXdr: string) => Invocation,
 *   contracts?: Set<string>,
 * }} options
 * @returns {TxFee | null}
 */
export function parseTxFee(record, { decode, contracts }) {
  if (!record || typeof record.hash !== 'string' || !record.envelope_xdr) return null;

  const feeCharged = parseStroops(record.fee_charged);
  const maxFee = parseStroops(record.max_fee);
  if (feeCharged === null || maxFee === null) return null;

  /** @type {Invocation} */
  let invocation;
  try {
    invocation = decode(record.envelope_xdr);
  } catch {
    return null;
  }
  if (!invocation) return null;
  // An allowlist of contracts narrows tracking to Trivela's own contracts.
  if (contracts && contracts.size > 0 && !contracts.has(invocation.contractId ?? '')) {
    return null;
  }

  const ledger = Number(record.ledger);
  return {
    txHash: record.hash,
    sourceAccount: String(record.source_account ?? ''),
    feeAccount: String(record.fee_account ?? record.source_account ?? ''),
    contractId: invocation.contractId,
    functionName: invocation.functionName,
    feeCharged,
    maxFee,
    feeBump: Boolean(record.fee_bump_transaction),
    successful: record.successful !== false,
    ledger: Number.isFinite(ledger) ? ledger : null,
    createdAt: record.created_at ?? new Date().toISOString(),
  };
}

/**
 * Nearest-rank percentile over an ascending-sorted array.
 * @param {number[]} sorted
 * @param {number} p between 0 and 100
 */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/**
 * @param {{
 *   db: InstanceType<import('better-sqlite3')>,
 *   horizonUrl: string,
 *   networkPassphrase: string,
 *   accounts: string[],
 *   contracts?: string[],
 *   allowHttp?: boolean,
 *   pollIntervalMs?: number,
 *   pageSize?: number,
 *   serverFactory?: (url: string, opts: { allowHttp: boolean }) => any,
 *   decode?: (envelopeXdr: string) => Invocation,
 *   onFee?: (fee: TxFee) => void,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 * }} options
 */
export function createGasCostMonitor({
  db,
  horizonUrl,
  networkPassphrase,
  accounts,
  contracts = [],
  allowHttp = false,
  pollIntervalMs = 60_000,
  pageSize = MAX_PAGE_SIZE,
  serverFactory = (url, opts) => new Horizon.Server(url, opts),
  decode = (envelopeXdr) => decodeInvocation(envelopeXdr, networkPassphrase),
  onFee,
  logger = console,
}) {
  const watched = [...new Set(accounts.filter(Boolean))];
  const contractSet = new Set(contracts.filter(Boolean));
  const limit = Math.min(Math.max(Math.trunc(pageSize) || MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO contract_tx_fees
      (tx_hash, source_account, fee_account, contract_id, function_name, fee_charged,
       max_fee, fee_bump, successful, ledger, created_at, recorded_at)
    VALUES (@txHash, @sourceAccount, @feeAccount, @contractId, @functionName, @feeCharged,
            @maxFee, @feeBump, @successful, @ledger, @createdAt, @recordedAt)
  `);
  const getCursorStmt = db.prepare('SELECT cursor FROM gas_monitor_cursors WHERE account = ?');
  const setCursorStmt = db.prepare(`
    INSERT INTO gas_monitor_cursors (account, cursor, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (account) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at
  `);

  let timer = null;
  let running = false;
  let polling = false;
  let lastPollAt = null;
  let lastError = null;
  const metrics = { feesRecorded: 0, duplicates: 0, skipped: 0, errors: 0 };

  /**
   * Record one Horizon transaction record.
   * @param {Record<string, any>} record
   * @returns {{ fee: TxFee, duplicate: boolean } | null}
   */
  function recordTransaction(record) {
    const fee = parseTxFee(record, { decode, contracts: contractSet });
    if (!fee) {
      metrics.skipped++;
      return null;
    }
    const result = insertStmt.run({
      ...fee,
      feeBump: fee.feeBump ? 1 : 0,
      successful: fee.successful ? 1 : 0,
      recordedAt: new Date().toISOString(),
    });
    const duplicate = result.changes === 0;
    if (duplicate) {
      metrics.duplicates++;
    } else {
      metrics.feesRecorded++;
      try {
        onFee?.(fee);
      } catch (err) {
        logger.warn?.({ err }, 'gasMonitor:onFee_failed');
      }
    }
    return { fee, duplicate };
  }

  /**
   * Drain all new transactions for one account, page by page.
   * @param {string} account
   */
  async function pollAccount(account) {
    const server = serverFactory(horizonUrl, { allowHttp });
    let cursor = /** @type {{ cursor: string } | undefined} */ (getCursorStmt.get(account))
      ?.cursor;
    let recorded = 0;

    if (!cursor) {
      // First run for this account: anchor at its latest transaction so
      // enabling the worker does not backfill the account's entire history.
      const latest = await server.transactions().forAccount(account).order('desc').limit(1).call();
      cursor = String(latest?.records?.[0]?.paging_token ?? '0');
      setCursorStmt.run(account, cursor, new Date().toISOString());
    }

    for (;;) {
      const page = await server
        .transactions()
        .forAccount(account)
        .cursor(cursor)
        .order('asc')
        .limit(limit)
        .call();
      const records = Array.isArray(page?.records) ? page.records : [];

      const persist = db.transaction(() => {
        for (const record of records) {
          if (recordTransaction(record)?.duplicate === false) recorded++;
          if (record?.paging_token) cursor = String(record.paging_token);
        }
        setCursorStmt.run(account, cursor, new Date().toISOString());
      });
      persist();

      if (records.length < limit) break;
    }
    return recorded;
  }

  /** Poll every watched account once. Accounts fail independently. */
  async function runOnce() {
    if (polling) return { recorded: 0, skipped: true };
    polling = true;
    let recorded = 0;
    try {
      for (const account of watched) {
        try {
          recorded += await pollAccount(account);
        } catch (err) {
          metrics.errors++;
          lastError = { account, message: err?.message ?? String(err), at: new Date().toISOString() };
          logger.warn?.({ err, account }, 'gasMonitor:poll_failed');
        }
      }
      lastPollAt = new Date().toISOString();
      if (recorded > 0) logger.info?.({ recorded }, 'gasMonitor:fees_recorded');
      return { recorded, skipped: false };
    } finally {
      polling = false;
    }
  }

  function start() {
    if (running || watched.length === 0) return;
    running = true;
    const tick = () =>
      runOnce().catch((err) => {
        metrics.errors++;
        logger.error?.({ err }, 'gasMonitor:unexpected_error');
      });
    timer = setInterval(tick, pollIntervalMs);
    timer.unref?.();
    tick();
    logger.info?.({ accounts: watched.length, horizonUrl }, 'gasMonitor:started');
  }

  function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getStatus() {
    return {
      running,
      pollIntervalMs,
      lastPollAt,
      lastError,
      contracts: [...contractSet],
      accounts: watched.map((account) => ({
        account,
        cursor:
          /** @type {{ cursor: string } | undefined} */ (getCursorStmt.get(account))?.cursor ??
          null,
      })),
      ...metrics,
    };
  }

  /**
   * @param {{ since?: string, until?: string, contractId?: string, successful?: boolean }} filter
   */
  function buildWhere({ since, until, contractId, successful } = {}) {
    const where = [];
    const params = [];
    if (since) {
      where.push('created_at >= ?');
      params.push(since);
    }
    if (until) {
      where.push('created_at < ?');
      params.push(until);
    }
    if (contractId) {
      where.push('contract_id = ?');
      params.push(contractId);
    }
    if (typeof successful === 'boolean') {
      where.push('successful = ?');
      params.push(successful ? 1 : 0);
    }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  /** @param {number[]} fees ascending */
  function summarize(fees) {
    const count = fees.length;
    const total = fees.reduce((a, b) => a + b, 0);
    const avg = count ? Math.round(total / count) : 0;
    const stats = {
      min: count ? fees[0] : 0,
      max: count ? fees[count - 1] : 0,
      avg,
      p50: percentile(fees, 50),
      p95: percentile(fees, 95),
      p99: percentile(fees, 99),
    };
    return {
      count,
      totalStroops: total,
      totalXlm: stroopsToXlm(total),
      stroops: stats,
      xlm: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, stroopsToXlm(v)])),
    };
  }

  /**
   * Aggregate fee metrics over a window, overall and per contract.
   * @param {{ since?: string, until?: string, contractId?: string }} [filter]
   */
  function getSummary(filter = {}) {
    const { clause, params } = buildWhere(filter);
    const rows = /** @type {{ contract_id: string | null, fee_charged: number, successful: number }[]} */ (
      db
        .prepare(
          `SELECT contract_id, fee_charged, successful FROM contract_tx_fees ${clause}
           ORDER BY fee_charged ASC`,
        )
        .all(...params)
    );

    /** @type {Map<string | null, number[]>} */
    const byContract = new Map();
    let failed = 0;
    for (const row of rows) {
      if (!row.successful) failed++;
      const list = byContract.get(row.contract_id) ?? [];
      list.push(row.fee_charged);
      byContract.set(row.contract_id, list);
    }

    return {
      since: filter.since ?? null,
      until: filter.until ?? null,
      ...summarize(rows.map((r) => r.fee_charged)),
      failedCount: failed,
      contracts: [...byContract.entries()]
        .map(([contractId, fees]) => ({ contractId, ...summarize(fees) }))
        .sort((a, b) => b.totalStroops - a.totalStroops),
    };
  }

  /**
   * Per-day fee totals (UTC), newest first.
   * @param {{ since?: string, until?: string, contractId?: string, days?: number }} [filter]
   */
  function getDailyBreakdown({ days = 30, ...filter } = {}) {
    const { clause, params } = buildWhere(filter);
    const capped = Math.min(Math.max(Math.trunc(days) || 30, 1), 366);
    return /** @type {{ day: string, count: number, total: number, avg: number, max: number }[]} */ (
      db
        .prepare(
          `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count,
                  SUM(fee_charged) AS total, AVG(fee_charged) AS avg, MAX(fee_charged) AS max
           FROM contract_tx_fees ${clause}
           GROUP BY day ORDER BY day DESC LIMIT ?`,
        )
        .all(...params, capped)
    ).map((row) => ({
      day: row.day,
      count: row.count,
      totalStroops: row.total,
      totalXlm: stroopsToXlm(row.total),
      avgStroops: Math.round(row.avg),
      maxStroops: row.max,
    }));
  }

  /**
   * @param {{ contractId?: string, limit?: number, beforeId?: number }} [filter]
   */
  function listTransactions({ contractId, limit: max = 50, beforeId } = {}) {
    const { clause, params } = buildWhere({ contractId });
    const where = beforeId ? `${clause ? `${clause} AND` : 'WHERE'} id < ?` : clause;
    if (beforeId) params.push(beforeId);
    return db
      .prepare(`SELECT * FROM contract_tx_fees ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, Math.min(Math.max(Math.trunc(max) || 50, 1), MAX_LIST_LIMIT))
      .map(rowToTxFee);
  }

  /** Totals for the Prometheus /metrics endpoint. */
  function getMetricsSnapshot() {
    const row = /** @type {{ count: number, total: number | null }} */ (
      db.prepare('SELECT COUNT(*) AS count, SUM(fee_charged) AS total FROM contract_tx_fees').get()
    );
    return { txCount: row.count, feeStroopsTotal: row.total ?? 0 };
  }

  return {
    start,
    stop,
    runOnce,
    recordTransaction,
    getStatus,
    getSummary,
    getDailyBreakdown,
    listTransactions,
    getMetricsSnapshot,
  };
}

function rowToTxFee(row) {
  return {
    id: row.id,
    txHash: row.tx_hash,
    sourceAccount: row.source_account,
    feeAccount: row.fee_account,
    contractId: row.contract_id,
    functionName: row.function_name,
    feeChargedStroops: row.fee_charged,
    feeChargedXlm: stroopsToXlm(row.fee_charged),
    maxFeeStroops: row.max_fee,
    feeBump: Boolean(row.fee_bump),
    successful: Boolean(row.successful),
    ledger: row.ledger,
    createdAt: row.created_at,
    recordedAt: row.recorded_at,
  };
}
