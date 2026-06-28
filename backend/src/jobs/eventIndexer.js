/**
 * Enhanced event indexer for Trivela Soroban contract events.
 *
 * Features:
 * - Durable cursor persistence in indexer_state table
 * - Idempotent upserts via UNIQUE(tx_hash, event_index) constraint
 * - Prometheus metrics for monitoring
 * - Health status endpoint
 * - Projection handlers per event type
 */

export function createEventIndexer({
  db,
  rpcPool,
  logger = console,
  referralBonus = 0,
} = {}) {
  const metrics = {
    lastLedger: 0,
    lagLedgers: 0,
    eventsTotal: 0,
    errorsTotal: 0,
    lastPollAt: null,
  };

  const handlers = {
    credit: handleCreditEvent,
    claim: handleClaimEvent,
    snapshot: handleSnapshotEvent,
    vcredit: handleVestedCreditEvent,
    vclaim: handleVestedClaimEvent,
    referred: (event, database) => handleReferredEvent(event, database, referralBonus),
    refbonus: handleRefBonusEvent,
    register: handleRegisterEvent,
    deregister: handleDeregisterEvent,
  };

  async function processEvent(event, contractId) {
    const topic = event.topic?.[0];
    const handler = handlers[topic];
    if (!handler) return;

    try {
      const txHash = event.txHash || 'unknown';
      const eventIndex = event.eventIndex || 0;
      const ledger = event.ledger || 0;

      const existing = db.prepare(
        'SELECT id FROM indexed_events WHERE tx_hash = ? AND event_index = ?'
      ).get(txHash, eventIndex);

      if (existing) {
        return;
      }

      db.prepare(`
        INSERT OR IGNORE INTO indexed_events (ledger, tx_hash, contract_id, event_type, topic, data_json, event_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        ledger,
        txHash,
        contractId,
        topic,
        JSON.stringify(event.topic || []),
        JSON.stringify(event.data),
        eventIndex,
      );

      await handler(event, db);
      metrics.eventsTotal++;
    } catch (err) {
      metrics.errorsTotal++;
      logger.error?.(`eventIndexer:error topic=${topic}`, err);
    }
  }

  async function poll(contractId, cursor) {
    const rpc = await rpcPool.acquire();
    try {
      const { events, nextCursor } = await rpc.getEvents({
        contractId,
        cursor,
        limit: 200,
      });

      for (const event of events) {
        await processEvent(event, contractId);
      }

      if (nextCursor) {
        updateCursor(contractId, nextCursor, events.length > 0 ? events[events.length - 1].ledger : 0);
      }

      metrics.lastPollAt = new Date().toISOString();
      return nextCursor;
    } finally {
      rpcPool.release(rpc);
    }
  }

  function getCursor(contractId) {
    const state = db.prepare('SELECT cursor FROM indexer_state WHERE contract_id = ?').get(contractId);
    return state?.cursor || null;
  }

  function updateCursor(contractId, cursor, lastLedger) {
    db.prepare(`
      INSERT INTO indexer_state (contract_id, cursor, last_ledger, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(contract_id) DO UPDATE SET
        cursor = excluded.cursor,
        last_ledger = excluded.last_ledger,
        updated_at = datetime('now')
    `).run(contractId, cursor, lastLedger);
    metrics.lastLedger = lastLedger;
  }

  function getHealth() {
    return {
      status: metrics.lastPollAt ? 'ok' : 'idle',
      lastLedger: metrics.lastLedger,
      lagLedgers: metrics.lagLedgers,
      eventsTotal: metrics.eventsTotal,
      errorsTotal: metrics.errorsTotal,
      lastPollAt: metrics.lastPollAt,
    };
  }

  function getMetrics() {
    return {
      indexer_last_ledger: metrics.lastLedger,
      indexer_lag_ledgers: metrics.lagLedgers,
      indexer_events_total: metrics.eventsTotal,
      indexer_errors_total: metrics.errorsTotal,
    };
  }

  return { processEvent, poll, getCursor, getHealth, getMetrics };
}

async function handleCreditEvent(event, db) {
  const user = event.topic?.[1];
  const amount = BigInt(event.data ?? 0);
  await db.run(
    `INSERT OR IGNORE INTO balances (user) VALUES (?)
     ON CONFLICT(user) DO UPDATE SET balance = balance + ?`,
    [user, amount.toString()],
  );
  await db.run(`INSERT INTO credit_events (user, amount, ledger, tx_hash) VALUES (?, ?, ?, ?)`, [
    user,
    amount.toString(),
    event.ledger,
    event.txHash,
  ]);
}

async function handleClaimEvent(event, db) {
  const user = event.topic?.[1];
  const amount = BigInt(event.data ?? 0);
  await db.run(`UPDATE balances SET balance = balance - ? WHERE user = ?`, [
    amount.toString(),
    user,
  ]);
  await db.run(`INSERT INTO claim_events (user, amount, ledger, tx_hash) VALUES (?, ?, ?, ?)`, [
    user,
    amount.toString(),
    event.ledger,
    event.txHash,
  ]);
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

async function handleVestedCreditEvent(event, db) {
  const user = event.topic?.[1];
  const [vestId, total] = Array.isArray(event.data) ? event.data : [0, 0];
  await db.run(
    `INSERT INTO vesting_schedules (user, vest_id, total, ledger, tx_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [user, String(vestId), String(total), event.ledger, event.txHash],
  );
}

async function handleVestedClaimEvent(event, db) {
  const user = event.topic?.[1];
  const [vestId, amount] = Array.isArray(event.data) ? event.data : [0, 0];
  await db.run(
    `INSERT INTO vested_claim_events (user, vest_id, amount, ledger, tx_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [user, String(vestId), String(amount), event.ledger, event.txHash],
  );
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

  await db.run(
    `INSERT OR IGNORE INTO balances (user) VALUES (?)
     ON CONFLICT(user) DO UPDATE SET balance = balance + ?`,
    [referrer, bonus.toString()],
  );
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
  await db.run(
    `DELETE FROM participants WHERE user = ? AND campaign_id = ?`,
    [user, campaignId],
  );
}
