// @ts-check
import { Horizon } from '@stellar/stellar-sdk';

/**
 * Horizon account watcher for operator reward-token deposits (#1261).
 *
 * Streams payments for each watched contract-custody account, keeps only
 * incoming payments of the configured reward asset, and records them
 * idempotently so operators (and downstream checks) can verify that a deposit
 * actually landed. Stream cursors are persisted so a restart resumes where the
 * previous run stopped instead of missing deposits.
 */

const INCOMING_TYPES = new Set([
  'payment',
  'path_payment_strict_send',
  'path_payment_strict_receive',
  'create_account',
]);

/**
 * @typedef {{
 *   pagingToken: string, account: string, from: string | null, assetCode: string,
 *   assetIssuer: string | null, amount: string, txHash: string, verified: boolean,
 *   observedAt: string,
 * }} Deposit
 */

/**
 * Turn a Horizon operation record into a deposit, or null when it is not an
 * incoming deposit of the watched asset into a watched account.
 *
 * @param {Record<string, any>} record
 * @param {{ watched: Set<string>, asset: { code: string, issuer?: string | null } }} options
 * @returns {Deposit | null}
 */
export function parseDeposit(record, { watched, asset }) {
  if (!record || !INCOMING_TYPES.has(record.type)) return null;

  const isCreate = record.type === 'create_account';
  const to = isCreate ? record.account : record.to;
  const from = isCreate ? record.funder : record.from;
  if (!watched.has(to)) return null;
  // Movement between two watched custody accounts is not an external deposit.
  if (from && watched.has(from)) return null;

  const isNative = isCreate || record.asset_type === 'native';
  const assetCode = isNative ? 'XLM' : record.asset_code;
  const assetIssuer = isNative ? null : (record.asset_issuer ?? null);

  const wantsNative = asset.code === 'XLM' && !asset.issuer;
  if (
    wantsNative ? !isNative : assetCode !== asset.code || assetIssuer !== (asset.issuer ?? null)
  ) {
    return null;
  }

  const amount = String(isCreate ? record.starting_balance : record.amount);
  if (!(Number(amount) > 0)) return null;

  return {
    pagingToken: String(record.paging_token),
    account: to,
    from: from ?? null,
    assetCode,
    assetIssuer,
    amount,
    txHash: record.transaction_hash,
    // Horizon streams only successful operations unless include_failed is set.
    verified: record.transaction_successful !== false,
    observedAt: record.created_at ?? new Date().toISOString(),
  };
}

/**
 * @param {{
 *   db: InstanceType<import('better-sqlite3')>,
 *   horizonUrl: string,
 *   accounts: string[],
 *   asset?: { code: string, issuer?: string | null },
 *   allowHttp?: boolean,
 *   serverFactory?: (url: string, opts: { allowHttp: boolean }) => any,
 *   onDeposit?: (deposit: Deposit) => void,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 *   reconnectBaseMs?: number,
 *   reconnectMaxMs?: number,
 * }} options
 */
export function createHorizonDepositWatcher({
  db,
  horizonUrl,
  accounts,
  asset = { code: 'XLM', issuer: null },
  allowHttp = false,
  serverFactory = (url, opts) => new Horizon.Server(url, opts),
  onDeposit,
  logger = console,
  reconnectBaseMs = 5_000,
  reconnectMaxMs = 60_000,
}) {
  const watched = new Set(accounts);
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO operator_deposits
      (paging_token, account, from_address, asset_code, asset_issuer, amount, tx_hash,
       verified, observed_at, recorded_at)
    VALUES (@pagingToken, @account, @from, @assetCode, @assetIssuer, @amount, @txHash,
            @verified, @observedAt, @recordedAt)
  `);
  const getCursorStmt = db.prepare('SELECT cursor FROM horizon_watcher_cursors WHERE account = ?');
  const setCursorStmt = db.prepare(`
    INSERT INTO horizon_watcher_cursors (account, cursor, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (account) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at
  `);

  /** @type {Map<string, { close: (() => void) | null, timer: any, attempts: number, connected: boolean, lastEventAt: string | null }>} */
  const streams = new Map();
  let running = false;
  const metrics = { depositsRecorded: 0, duplicates: 0, errors: 0 };

  /**
   * Process one Horizon operation record.
   * @param {Record<string, any>} record
   * @param {string} [streamAccount] the account whose stream delivered the record
   * @returns {{ deposit: Deposit, duplicate: boolean } | null}
   */
  function handleRecord(record, streamAccount = record?.to ?? record?.account) {
    const deposit = parseDeposit(record, { watched, asset });
    // Advance the stream's cursor for every record (even ignored ones, e.g.
    // outgoing payments) so a restart does not re-scan history.
    if (record?.paging_token && watched.has(streamAccount)) {
      setCursorStmt.run(streamAccount, String(record.paging_token), new Date().toISOString());
    }
    if (!deposit) return null;

    const result = insertStmt.run({
      ...deposit,
      verified: deposit.verified ? 1 : 0,
      recordedAt: new Date().toISOString(),
    });
    const duplicate = result.changes === 0;
    if (duplicate) {
      metrics.duplicates++;
    } else {
      metrics.depositsRecorded++;
      logger.info?.(
        {
          account: deposit.account,
          amount: deposit.amount,
          asset: deposit.assetCode,
          tx: deposit.txHash,
        },
        'depositWatcher:deposit',
      );
      try {
        onDeposit?.(deposit);
      } catch (err) {
        logger.warn?.({ err }, 'depositWatcher:onDeposit_failed');
      }
    }
    return { deposit, duplicate };
  }

  /** @param {string} account */
  function connect(account) {
    if (!running) return;
    const state = /** @type {NonNullable<ReturnType<typeof streams.get>>} */ (streams.get(account));
    const saved = /** @type {{ cursor: string } | undefined} */ (getCursorStmt.get(account));

    try {
      const server = serverFactory(horizonUrl, { allowHttp });
      state.close = server
        .payments()
        .forAccount(account)
        .cursor(saved?.cursor ?? 'now')
        .stream({
          onmessage: (/** @type {Record<string, any>} */ record) => {
            state.connected = true;
            state.attempts = 0;
            state.lastEventAt = new Date().toISOString();
            try {
              handleRecord(record, account);
            } catch (err) {
              metrics.errors++;
              logger.error?.({ err, account }, 'depositWatcher:handle_error');
            }
          },
          onerror: (/** @type {unknown} */ err) => {
            metrics.errors++;
            state.connected = false;
            logger.warn?.({ err, account }, 'depositWatcher:stream_error');
            state.close?.();
            state.close = null;
            scheduleReconnect(account);
          },
        });
    } catch (err) {
      metrics.errors++;
      logger.error?.({ err, account }, 'depositWatcher:connect_failed');
      scheduleReconnect(account);
    }
  }

  /** @param {string} account */
  function scheduleReconnect(account) {
    const state = streams.get(account);
    if (!running || !state) return;
    state.attempts += 1;
    const delay = Math.min(reconnectBaseMs * 2 ** (state.attempts - 1), reconnectMaxMs);
    state.timer = setTimeout(() => connect(account), delay);
    state.timer.unref?.();
  }

  function start() {
    if (running) return;
    running = true;
    for (const account of watched) {
      streams.set(account, {
        close: null,
        timer: null,
        attempts: 0,
        connected: false,
        lastEventAt: null,
      });
      connect(account);
    }
    logger.info?.({ accounts: watched.size, horizonUrl }, 'depositWatcher:started');
  }

  function stop() {
    running = false;
    for (const state of streams.values()) {
      if (state.timer) clearTimeout(state.timer);
      state.close?.();
      state.close = null;
      state.connected = false;
    }
  }

  function getStatus() {
    return {
      running,
      asset: { code: asset.code, issuer: asset.issuer ?? null },
      accounts: [...streams.entries()].map(([account, s]) => ({
        account,
        connected: s.connected,
        reconnectAttempts: s.attempts,
        lastEventAt: s.lastEventAt,
        cursor:
          /** @type {{ cursor: string } | undefined} */ (getCursorStmt.get(account))?.cursor ??
          null,
      })),
      ...metrics,
    };
  }

  /**
   * @param {{ account?: string, limit?: number, beforeId?: number }} [filter]
   */
  function listDeposits({ account, limit = 50, beforeId } = {}) {
    const where = [];
    const params = [];
    if (account) {
      where.push('account = ?');
      params.push(account);
    }
    if (beforeId) {
      where.push('id < ?');
      params.push(beforeId);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db
      .prepare(`SELECT * FROM operator_deposits ${clause} ORDER BY id DESC LIMIT ?`)
      .all(...params, Math.min(Math.max(limit, 1), 200))
      .map(rowToDeposit);
  }

  /** @param {string} txHash */
  function getByTxHash(txHash) {
    return db
      .prepare('SELECT * FROM operator_deposits WHERE tx_hash = ? ORDER BY id')
      .all(txHash)
      .map(rowToDeposit);
  }

  return { start, stop, getStatus, handleRecord, listDeposits, getByTxHash };
}

function rowToDeposit(row) {
  return {
    id: row.id,
    account: row.account,
    from: row.from_address,
    assetCode: row.asset_code,
    assetIssuer: row.asset_issuer,
    amount: row.amount,
    txHash: row.tx_hash,
    verified: Boolean(row.verified),
    observedAt: row.observed_at,
    recordedAt: row.recorded_at,
  };
}
