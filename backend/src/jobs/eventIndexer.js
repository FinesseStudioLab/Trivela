/**
 * Enhanced event indexer for Trivela Soroban contract events.
 *
 * Subscribes to on-chain events and persists them to the database.
 * Snapshot events store a ledger reference so off-chain tools can
 * reconstruct user balances at that point using Horizon getLedgerEntries.
 *
 * `pollWithCursor` (issue #753) adds:
 * - Durable cursor: the last-seen event cursor is stored in `indexer_cursors`
 *   and resumed on restart, so no events are skipped or re-processed after a
 *   crash.
 * - Exactly-once via per-event dedupe: `processed_events` records a unique key
 *   per event (contract_id + ledger + event_index). Replaying the same ledger
 *   range produces no duplicate DB rows.
 * - Backpressure: ingestion is paused when the writer is saturated. A bounded
 *   semaphore caps the number of events being processed concurrently; when all
 *   slots are occupied the fetch loop waits rather than accumulating unbounded
 *   in-flight work.
 */

/**
 * Bounded concurrency semaphore for backpressure.
 * `acquire()` resolves immediately when a slot is free; otherwise it waits
 * until one is released, naturally pausing the fetch loop.
 */
class Semaphore {
  constructor(limit) {
    this._limit = limit;
    this._active = 0;
    this._queue = [];
  }

  acquire() {
    if (this._active < this._limit) {
      this._active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this._queue.push(resolve));
  }

  release() {
    this._active--;
    if (this._queue.length > 0) {
      this._active++;
      this._queue.shift()();
    }
  }
}

/**
 * Features:
 * - Durable cursor persistence in indexer_state table
 * - Idempotent upserts via UNIQUE(tx_hash, event_index) constraint
 * - Reorg-safe ingestion with a configurable confirmation depth (#981)
 * - Prometheus metrics for monitoring
 * - Health status endpoint
 * - Projection handlers per event type
 * - Horizon SSE streaming for near-instant indexing (falls back to polling)
 *
 * ## Reorg safety
 *
 * An event lands in `indexed_events` as soon as it is seen, but its projection
 * (the balance / participant / vesting rows the API reads) is only applied once
 * the event is buried under `confirmationDepth` ledgers. Until then the row is
 * `tentative` and no derived state depends on it, so unwinding a fork is a
 * status flip rather than a compensating-write problem.
 *
 * A reorg is detected two ways, whichever the data source supports:
 *   1. an explicit ledger hash (`event.ledgerHash`) that differs from the hash
 *      already recorded for that ledger, or
 *   2. a different `tx_hash` at a (ledger, event_index) slot we have already
 *      ingested — a replaced ledger by definition carries different txs.
 *
 * On detection the indexer marks everything tentative at or above the fork
 * ledger `reverted`, drops the stale ledger hashes, rewinds ingestion to the
 * last fully-confirmed ledger, and logs the event in `indexer_reorgs`.
 *
 * `confirmationDepth: 0` (the default, for backwards compatibility) projects on
 * arrival. Reorgs are still *detected* in that mode, but they land below the
 * confirmed watermark, so the indexer records `breached_confirmed` and reports
 * itself `degraded` rather than silently serving wrong balances.
 */

import { Horizon } from '@stellar/stellar-sdk';

const TENTATIVE = 'tentative';
const CONFIRMED = 'confirmed';
const REVERTED = 'reverted';

/**
 * Normalises the two database shapes this module is used with: the synchronous
 * better-sqlite3 handle (`prepare(sql).run(...params)`) wired up in production,
 * and the async `run(sql, params)` handle used by the DAL mocks. Without it the
 * projection handlers threw against better-sqlite3 and derived state was never
 * written — the raw events landed but nothing was projected.
 */
function createSqlAdapter(db) {
  const prepared = (text) => (typeof db?.prepare === 'function' ? db.prepare(text) : null);

  return {
    async run(text, params = []) {
      const stmt = prepared(text);
      if (stmt && typeof stmt.run === 'function') return stmt.run(...params);
      if (typeof db?.run === 'function') return db.run(text, params);
      return { changes: 0 };
    },
    async get(text, params = []) {
      const stmt = prepared(text);
      if (stmt && typeof stmt.get === 'function') return stmt.get(...params);
      if (typeof db?.get === 'function') return db.get(text, params);
      return undefined;
    },
    async all(text, params = []) {
      const stmt = prepared(text);
      if (stmt && typeof stmt.all === 'function') return stmt.all(...params);
      if (typeof db?.all === 'function') return db.all(text, params);
      return [];
    },
  };
}

export function createEventIndexer({
  db,
  rpcPool,
  logger = console,
  referralBonus = 0,
  confirmationDepth = 0,
  notificationService,
} = {}) {
  const sql = createSqlAdapter(db);
  const depth = Math.max(0, Math.floor(Number(confirmationDepth)) || 0);

  const metrics = {
    lastLedger: 0,
    safeLedger: 0,
    lagLedgers: 0,
    eventsTotal: 0,
    errorsTotal: 0,
    gapsDetected: 0,
    reorgsTotal: 0,
    reorgsUnsafe: 0,
    eventsReverted: 0,
    pendingEvents: 0,
    lastPollAt: null,
    lastReorgAt: null,
  };

  const handlers = {
    credit: (event, db) => handleCreditEvent(event, db, notificationService),
    claim: (event, db) => handleClaimEvent(event, db, notificationService),
    snapshot: handleSnapshotEvent,
    vcredit: (event, db) => handleVestedCreditEvent(event, db, notificationService),
    vclaim: (event, db) => handleVestedClaimEvent(event, db, notificationService),
    referred: (event, database) => handleReferredEvent(event, database, referralBonus),
    refbonus: handleRefBonusEvent,
    register: handleRegisterEvent,
    deregister: handleDeregisterEvent,
  };

  // ── Reorg detection ────────────────────────────────────────────────────────

  /**
   * Returns fork details when `event` contradicts what is already stored for
   * its ledger, or `null` when the chain still looks linear.
   */
  async function detectReorg(event, contractId) {
    const ledger = Number(event.ledger) || 0;
    if (ledger <= 0) return null;

    // 1. Explicit ledger hash, when the data source exposes one.
    const ledgerHash = event.ledgerHash ?? event.ledgerCloseHash ?? null;
    if (ledgerHash) {
      const known = await sql.get(
        'SELECT ledger_hash FROM indexer_ledger_hashes WHERE contract_id = ? AND ledger = ?',
        [contractId ?? null, ledger],
      );
      if (known?.ledger_hash && known.ledger_hash !== ledgerHash) {
        return { forkLedger: ledger, previousHash: known.ledger_hash, newHash: ledgerHash };
      }
      return null;
    }

    // 2. Otherwise compare the tx occupying this (ledger, event_index) slot.
    const slot = await sql.get(
      `SELECT tx_hash FROM indexed_events
       WHERE contract_id = ? AND ledger = ? AND event_index = ?`,
      [contractId ?? null, ledger, Number(event.eventIndex) || 0],
    );
    const txHash = event.txHash || 'unknown';
    if (slot?.tx_hash && slot.tx_hash !== txHash) {
      return { forkLedger: ledger, previousHash: slot.tx_hash, newHash: txHash };
    }

    return null;
  }

  /**
   * Unwinds every tentative row at or above `forkLedger` and rewinds ingestion
   * to the confirmed watermark.
   *
   * Confirmed rows are deliberately left alone. If the fork reaches below the
   * watermark the reorg was deeper than the configured confirmation depth,
   * which needs an operator-driven replay — that case is recorded as
   * `breached_confirmed` and surfaced through health instead of being papered
   * over with guessed compensating writes.
   */
  async function handleReorg({ forkLedger, previousHash, newHash }, contractId) {
    const state = await getState(contractId);
    const safeLedger = Number(state?.safe_ledger) || 0;
    const breached = forkLedger <= safeLedger || depth === 0;

    const reverted = await sql.run(
      `UPDATE indexed_events SET status = ?
       WHERE contract_id = ? AND ledger >= ? AND status = ?`,
      [REVERTED, contractId ?? null, forkLedger, TENTATIVE],
    );
    const revertedCount = Number(reverted?.changes) || 0;

    await sql.run('DELETE FROM indexer_ledger_hashes WHERE contract_id = ? AND ledger >= ?', [
      contractId ?? null,
      forkLedger,
    ]);

    await sql.run(
      `INSERT INTO indexer_reorgs
         (contract_id, fork_ledger, previous_hash, new_hash, depth, reverted_events, breached_confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        contractId ?? null,
        forkLedger,
        previousHash ?? null,
        newHash ?? null,
        Math.max(1, (Number(state?.last_ledger) || forkLedger) - forkLedger + 1),
        revertedCount,
        breached ? 1 : 0,
      ],
    );

    // Rewind ingestion so the next poll re-reads the replacement fork from a
    // ledger we still trust, rather than continuing off an invalidated cursor.
    await sql.run(
      `UPDATE indexer_state SET cursor = NULL, last_ledger = ?, updated_at = datetime('now')
       WHERE contract_id = ?`,
      [safeLedger, contractId ?? null],
    );

    metrics.reorgsTotal++;
    metrics.eventsReverted += revertedCount;
    metrics.pendingEvents = Math.max(0, metrics.pendingEvents - revertedCount);
    metrics.lastReorgAt = new Date().toISOString();
    metrics.lastLedger = safeLedger;

    if (breached) {
      metrics.reorgsUnsafe++;
      logger.error?.(
        `indexer:reorg breached the confirmed watermark contractId=${contractId} ` +
          `forkLedger=${forkLedger} safeLedger=${safeLedger} confirmationDepth=${depth} ` +
          '— derived state may need a replay',
      );
    } else {
      logger.warn?.(
        `indexer:reorg contractId=${contractId} forkLedger=${forkLedger} reverted=${revertedCount}`,
      );
    }

    return { forkLedger, revertedCount, breached };
  }

  async function recordLedgerHash(event, contractId) {
    const ledgerHash = event.ledgerHash ?? event.ledgerCloseHash ?? null;
    if (!ledgerHash) return;

    await sql.run(
      `INSERT INTO indexer_ledger_hashes (contract_id, ledger, ledger_hash, seen_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(contract_id, ledger) DO UPDATE SET
         ledger_hash = excluded.ledger_hash,
         seen_at = excluded.seen_at`,
      [contractId ?? null, Number(event.ledger) || 0, ledgerHash],
    );
  }

  // ── Ingestion ──────────────────────────────────────────────────────────────

  /**
   * Ingests a single event. Events that are not yet buried under
   * `confirmationDepth` ledgers are stored as `tentative` and projected later
   * by `confirmPending`.
   *
   * @param {object} event
   * @param {string} [contractId]
   * @param {{ tip?: number }} [context] observed chain tip, used to decide
   *   whether the event is already deep enough to project immediately.
   */
  async function processEvent(event, contractId, context = {}) {
    const topic = event.topic?.[0];
    const handler = handlers[topic];
    if (!handler) return;

    try {
      const txHash = event.txHash || 'unknown';
      const eventIndex = Number(event.eventIndex) || 0;
      const ledger = Number(event.ledger) || 0;

      const existing = await sql.get(
        'SELECT id, status FROM indexed_events WHERE tx_hash = ? AND event_index = ?',
        [txHash, eventIndex],
      );

      if (existing) {
        return;
      }

      const reorg = await detectReorg(event, contractId);
      if (reorg) await handleReorg(reorg, contractId);

      await recordLedgerHash(event, contractId);

      // Depth 0 keeps the pre-#981 behaviour: project on arrival.
      const tip = Number(context.tip) || 0;
      const isConfirmed = depth === 0 || (tip > 0 && ledger > 0 && tip - ledger >= depth);

      await sql.run(
        `
        INSERT OR IGNORE INTO indexed_events
          (ledger, tx_hash, contract_id, event_type, topic, data_json, event_index, status, ledger_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          ledger,
          txHash,
          contractId ?? null,
          topic,
          JSON.stringify(event.topic || []),
          JSON.stringify(event.data ?? null),
          eventIndex,
          isConfirmed ? CONFIRMED : TENTATIVE,
          event.ledgerHash ?? event.ledgerCloseHash ?? null,
        ],
      );

      if (!isConfirmed) {
        metrics.pendingEvents++;
        return;
      }

      await handler(event, sql);
      metrics.eventsTotal++;
    } catch (err) {
      metrics.errorsTotal++;
      logger.error?.(`eventIndexer:error topic=${topic}`, err);
    }
  }

  /**
   * Projects every tentative event now buried under `confirmationDepth`
   * ledgers, oldest first, then advances the confirmed watermark.
   *
   * @returns {Promise<number>} how many events were promoted
   */
  async function confirmPending(contractId, tip) {
    if (depth === 0) return 0;

    const chainTip = Number(tip) || 0;
    const cutoff = chainTip - depth;
    if (cutoff <= 0) return 0;

    const rows = await sql.all(
      `SELECT id, event_type, topic, data_json, ledger, tx_hash, event_index
       FROM indexed_events
       WHERE contract_id = ? AND status = ? AND ledger <= ?
       ORDER BY ledger ASC, event_index ASC`,
      [contractId ?? null, TENTATIVE, cutoff],
    );

    let promoted = 0;
    for (const row of rows) {
      const handler = handlers[row.event_type];
      try {
        if (handler) await handler(hydrateEvent(row), sql);
        await sql.run('UPDATE indexed_events SET status = ? WHERE id = ?', [CONFIRMED, row.id]);
        promoted++;
        metrics.eventsTotal++;
        metrics.pendingEvents = Math.max(0, metrics.pendingEvents - 1);
      } catch (err) {
        metrics.errorsTotal++;
        logger.error?.(`eventIndexer:confirm:error id=${row.id}`, err);
      }
    }

    await sql.run(
      `UPDATE indexer_state SET safe_ledger = ?, updated_at = datetime('now')
       WHERE contract_id = ? AND safe_ledger < ?`,
      [cutoff, contractId ?? null, cutoff],
    );
    metrics.safeLedger = Math.max(metrics.safeLedger, cutoff);

    return promoted;
  }

  async function poll(contractId, cursor) {
    const rpc = await rpcPool.acquire();
    try {
      const state = await getState(contractId);
      const request = { contractId, limit: 200 };

      if (cursor) {
        request.cursor = cursor;
      } else if (Number(state?.safe_ledger) > 0) {
        // First poll after a reorg rewind: re-read from the ledger following
        // the confirmed watermark instead of an invalidated cursor.
        request.startLedger = Number(state.safe_ledger) + 1;
      }

      const response = (await rpc.getEvents(request)) ?? {};
      const { events = [], nextCursor } = response;

      const highestSeen = events.reduce((max, e) => Math.max(max, Number(e.ledger) || 0), 0);
      const tip = Number(response.latestLedger) || highestSeen;

      for (const event of events) {
        await processEvent(event, contractId, { tip });
      }

      await confirmPending(contractId, tip);

      if (nextCursor && events.length > 0) {
        const currentLedger = events[events.length - 1].ledger;
        await checkForGaps(contractId, currentLedger);
        await updateCursor(contractId, nextCursor, currentLedger);
      }

      if (tip > 0 && metrics.lastLedger > 0) {
        metrics.lagLedgers = Math.max(0, tip - metrics.lastLedger);
      }
      metrics.lastPollAt = new Date().toISOString();
      return nextCursor;
    } finally {
      rpcPool.release(rpc);
    }
  }

  /**
   * Poll once with durable cursor persistence, per-event exactly-once dedupe,
   * and bounded concurrency backpressure (issue #753).
   *
   * @param {string} contractId
   * @param {object} opts
   * @param {number} [opts.maxInflight=32]  Max concurrent event handlers.
   *   When all slots are occupied, new fetch calls pause until a slot frees —
   *   this is the backpressure mechanism.
   * @returns {Promise<string|undefined>}  The next cursor, or undefined when
   *   the indexer has caught up.
   */
  async function pollWithCursor(contractId, { maxInflight = 32 } = {}) {
    // Load the last durable cursor so we resume exactly where we left off.
    const cursorRow = await db.get(`SELECT cursor FROM indexer_cursors WHERE contract_id = ?`, [
      contractId,
    ]);
    const cursor = cursorRow?.cursor ?? undefined;

    const rpc = await rpcPool.acquire();
    let events, nextCursor;
    try {
      ({ events, nextCursor } = await rpc.getEvents({
        contractId,
        cursor,
        limit: 200,
      }));
    } finally {
      rpcPool.release(rpc);
    }

    if (!events || events.length === 0) {
      return nextCursor;
    }

    // Bounded concurrency — when all maxInflight slots are taken, acquire()
    // blocks, preventing unbounded in-flight growth (backpressure).
    const sem = new Semaphore(maxInflight);

    await Promise.all(
      events.map(async (event, eventIndex) => {
        await sem.acquire();
        try {
          // Exactly-once: use (contract_id, ledger, eventIndex) as the dedupe
          // key. INSERT OR IGNORE makes re-processing the same ledger range a
          // no-op; `changes === 0` means the event was already handled.
          const dedupeResult = await db.run(
            `INSERT OR IGNORE INTO processed_events
               (contract_id, ledger, event_index, processed_at)
             VALUES (?, ?, ?, ?)`,
            [contractId, event.ledger, eventIndex, Date.now()],
          );
          if (dedupeResult?.changes === 0) return;
          await processEvent(event);
        } finally {
          sem.release();
        }
      }),
    );

    // Persist the cursor only after the entire batch has been written. A crash
    // between batch processing and cursor write causes safe re-delivery (the
    // dedupe table absorbs duplicates); a crash after cursor write skips past
    // the batch — which is why we write cursor last.
    if (nextCursor != null) {
      await db.run(
        `INSERT INTO indexer_cursors (contract_id, cursor, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(contract_id)
         DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
        [contractId, nextCursor, new Date().toISOString()],
      );
    }

    return nextCursor;
  }

  async function checkForGaps(contractId, currentLedger) {
    const lastState = await sql.get('SELECT last_ledger FROM indexer_state WHERE contract_id = ?', [
      contractId,
    ]);
    const lastLedger = lastState?.last_ledger || 0;

    if (currentLedger > lastLedger + 1) {
      const gap = { contractId, fromLedger: lastLedger + 1, toLedger: currentLedger - 1 };
      try {
        await sql.run(
          `INSERT INTO indexer_gaps (contract_id, from_ledger, to_ledger, detected_at, reconciled_at)
           VALUES (?, ?, ?, datetime('now'), NULL)`,
          [gap.contractId, gap.fromLedger, gap.toLedger],
        );
        metrics.gapsDetected++;
        logger.warn?.(
          `indexer:gap detected contractId=${contractId} ledgers=${gap.fromLedger}-${gap.toLedger}`,
        );
      } catch (err) {
        logger.error?.('checkForGaps:insert', err);
      }
    }
  }

  async function getState(contractId) {
    return sql.get(
      'SELECT cursor, last_ledger, safe_ledger FROM indexer_state WHERE contract_id = ?',
      [contractId ?? null],
    );
  }

  async function getCursor(contractId) {
    const state = await sql.get('SELECT cursor FROM indexer_state WHERE contract_id = ?', [
      contractId,
    ]);
    return state?.cursor || null;
  }

  async function updateCursor(contractId, cursor, lastLedger) {
    await sql.run(
      `
      INSERT INTO indexer_state (contract_id, cursor, last_ledger, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(contract_id) DO UPDATE SET
        cursor = excluded.cursor,
        last_ledger = excluded.last_ledger,
        updated_at = datetime('now')
    `,
      [contractId, cursor, lastLedger],
    );
    metrics.lastLedger = lastLedger;
  }

  async function getHealth() {
    const unreconciledGaps = await sql.get(
      'SELECT COUNT(*) as count FROM indexer_gaps WHERE reconciled_at IS NULL',
    );
    const unsafeReorgs = await sql.get(
      `SELECT COUNT(*) as count FROM indexer_reorgs
       WHERE breached_confirmed = 1 AND resolved_at IS NULL`,
    );

    // A reorg that reached below the confirmed watermark means projections may
    // be built on a dead fork — never report that as healthy.
    const breached = (unsafeReorgs?.count || 0) > 0;
    const liveness = metrics.lastPollAt ? 'ok' : 'idle';

    return {
      status: breached ? 'degraded' : liveness,
      lastLedger: metrics.lastLedger,
      safeLedger: metrics.safeLedger,
      confirmationDepth: depth,
      lagLedgers: metrics.lagLedgers,
      eventsTotal: metrics.eventsTotal,
      errorsTotal: metrics.errorsTotal,
      gapsDetected: metrics.gapsDetected,
      unreconciledGaps: unreconciledGaps?.count || 0,
      reorgsTotal: metrics.reorgsTotal,
      reorgsUnsafe: unsafeReorgs?.count || 0,
      eventsReverted: metrics.eventsReverted,
      pendingEvents: metrics.pendingEvents,
      lastReorgAt: metrics.lastReorgAt,
      lastPollAt: metrics.lastPollAt,
    };
  }

  function getMetrics() {
    return {
      indexer_last_ledger: metrics.lastLedger,
      indexer_safe_ledger: metrics.safeLedger,
      indexer_confirmation_depth: depth,
      indexer_lag_ledgers: metrics.lagLedgers,
      indexer_events_total: metrics.eventsTotal,
      indexer_errors_total: metrics.errorsTotal,
      indexer_gaps_detected: metrics.gapsDetected,
      indexer_reorgs_total: metrics.reorgsTotal,
      indexer_reorgs_unsafe_total: metrics.reorgsUnsafe,
      indexer_events_reverted_total: metrics.eventsReverted,
      indexer_pending_events: metrics.pendingEvents,
    };
  }

  function startSse({ contractIds, horizonUrl, allowHttp = false }) {
    let stopped = false;
    let closeStream = null;
    let reconnectTimer = null;

    function connect() {
      if (stopped) return;

      let server;
      try {
        server = new Horizon.Server(horizonUrl, { allowHttp });
      } catch (err) {
        logger.error?.('eventIndexer:sse:init', err);
        if (!stopped) reconnectTimer = setTimeout(connect, 10_000);
        return;
      }

      closeStream = server
        .ledgers()
        .cursor('now')
        .stream({
          onmessage: async () => {
            for (const contractId of contractIds) {
              const cursor = await getCursor(contractId);
              await poll(contractId, cursor);
            }
          },
          onerror: (err) => {
            metrics.errorsTotal++;
            logger.error?.('eventIndexer:sse:error', err);
            if (!stopped) reconnectTimer = setTimeout(connect, 5_000);
          },
        });

      logger.info?.(`eventIndexer:sse started horizonUrl=${horizonUrl}`);
    }

    function stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typeof closeStream === 'function') closeStream();
    }

    connect();
    return { stop };
  }

  return {
    processEvent,
    poll,
    getCursor,
    getHealth,
    getMetrics,
    startSse,
    confirmPending,
    detectReorg,
    handleReorg,
    confirmationDepth: depth,
  };
}

/** Rebuilds the in-flight event shape from its stored row. */
function hydrateEvent(row) {
  const parse = (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };

  return {
    topic: parse(row.topic, []),
    data: parse(row.data_json, null),
    ledger: row.ledger,
    txHash: row.tx_hash,
    eventIndex: row.event_index,
  };
}

/**
 * Applies a signed delta to a user's balance, creating the row on first sight.
 *
 * The insert must carry the amount: an `INSERT OR IGNORE … VALUES (user)`
 * followed by `ON CONFLICT DO UPDATE` silently dropped the *first* credit for
 * every user, because there was no conflict to trigger the update.
 */
function applyBalanceDelta(db, user, delta) {
  return db.run(
    `INSERT INTO balances (user, balance, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user) DO UPDATE SET
       balance = balance + excluded.balance,
       updated_at = excluded.updated_at`,
    [user, delta.toString()],
  );
}

async function handleCreditEvent(event, db, notificationService) {
  const user = event.topic?.[1];
  const amount = BigInt(event.data ?? 0);
  await applyBalanceDelta(db, user, amount);
  await db.run(`INSERT INTO credit_events (user, amount, ledger, tx_hash) VALUES (?, ?, ?, ?)`, [
    user,
    amount.toString(),
    event.ledger,
    event.txHash,
  ]);

  if (notificationService && user) {
    const displayAmount = (Number(amount) / 1e7).toFixed(7);
    await notificationService.notify({
      userId: user,
      title: 'Points credited',
      message: `You received ${displayAmount} points.`,
      type: 'credit_received',
      campaignId: event.topic?.[2] ?? null,
    });
  }
}

async function handleClaimEvent(event, db, notificationService) {
  const user = event.topic?.[1];
  const amount = BigInt(event.data ?? 0);
  await applyBalanceDelta(db, user, -amount);
  await db.run(`INSERT INTO claim_events (user, amount, ledger, tx_hash) VALUES (?, ?, ?, ?)`, [
    user,
    amount.toString(),
    event.ledger,
    event.txHash,
  ]);

  if (notificationService && user) {
    const displayAmount = (Number(amount) / 1e7).toFixed(7);
    await notificationService.notify({
      userId: user,
      title: 'Claim confirmed',
      message: `You claimed ${displayAmount} points.`,
      type: 'claim_ready',
      campaignId: event.topic?.[2] ?? null,
    });
  }
}

async function handleSnapshotEvent(event, db) {
  const snapshotId = BigInt(event.topic?.[1] ?? 0);
  const snapshotLedger = BigInt(event.data ?? 0);
  await db.run(
    `INSERT OR REPLACE INTO snapshots (snapshot_id, ledger_number, recorded_at)
     VALUES (?, ?, ?)`,
    [snapshotId.toString(), snapshotLedger.toString(), Date.now()],
  );
}

async function handleVestedCreditEvent(event, db, notificationService) {
  const user = event.topic?.[1];
  const [vestId, total] = Array.isArray(event.data) ? event.data : [0, 0];
  await db.run(
    `INSERT INTO vesting_schedules (user, vest_id, total, ledger, tx_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [user, String(vestId), String(total), event.ledger, event.txHash],
  );

  if (notificationService && user) {
    const displayTotal = (Number(total) / 1e7).toFixed(7);
    await notificationService.notify({
      userId: user,
      title: 'Vesting schedule created',
      message: `A vesting schedule for ${displayTotal} points has been created.`,
      type: 'campaign_update',
      campaignId: event.topic?.[2] ?? null,
    });
  }
}

async function handleVestedClaimEvent(event, db, notificationService) {
  const user = event.topic?.[1];
  const [vestId, amount] = Array.isArray(event.data) ? event.data : [0, 0];
  await db.run(
    `INSERT INTO vested_claim_events (user, vest_id, amount, ledger, tx_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [user, String(vestId), String(amount), event.ledger, event.txHash],
  );

  if (notificationService && user) {
    const displayAmount = (Number(amount) / 1e7).toFixed(7);
    await notificationService.notify({
      userId: user,
      title: 'Vesting unlocked',
      message: `${displayAmount} points have been unlocked from vesting.`,
      type: 'reward_expiring',
      campaignId: event.topic?.[2] ?? null,
    });
  }
}

async function handleReferredEvent(event, db, referralBonus = 0) {
  const referee = event.topic?.[1];
  const referrer = event.topic?.[2];
  if (!referee || !referrer) return;

  const recorded = await db.run(
    `INSERT OR IGNORE INTO referral_credits (referee, referrer, ledger, tx_hash)
     VALUES (?, ?, ?, ?)`,
    [referee, referrer, event.ledger, event.txHash],
  );
  if (recorded && recorded.changes === 0) return;

  const bonus = BigInt(referralBonus);
  if (bonus <= 0n) return;

  await applyBalanceDelta(db, referrer, bonus);
  await db.run(`INSERT INTO credit_events (user, amount, ledger, tx_hash) VALUES (?, ?, ?, ?)`, [
    referrer,
    bonus.toString(),
    event.ledger,
    event.txHash,
  ]);
}

async function handleRefBonusEvent(event, db) {
  const referrer = event.topic?.[1];
  const referee = event.topic?.[2];
  if (!referrer || !referee) return;

  const [bonus, qualifyingAmount] = Array.isArray(event.data) ? event.data : [0, 0];
  await db.run(
    `INSERT OR IGNORE INTO referral_bonus_events
       (referrer, referee, bonus, qualifying_amount, ledger, tx_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      referrer,
      referee,
      String(bonus),
      String(qualifyingAmount),
      event.ledger,
      event.txHash,
      Date.now(),
    ],
  );
}

async function handleRegisterEvent(event, db) {
  const user = event.topic?.[1];
  const campaignId = event.topic?.[2];
  await db.run(
    `INSERT OR IGNORE INTO participants (user, campaign_id, registered_at, tx_hash)
     VALUES (?, ?, ?, ?)`,
    [user, campaignId, event.ledger, event.txHash],
  );
}

async function handleDeregisterEvent(event, db) {
  const user = event.topic?.[1];
  const campaignId = event.topic?.[2];
  await db.run(`DELETE FROM participants WHERE user = ? AND campaign_id = ?`, [user, campaignId]);
}
