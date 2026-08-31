/**
 * Reorg-safe ingestion tests (#981).
 *
 * These run against a real in-memory SQLite database rather than a mock, so the
 * migrations, the tentative/confirmed/reverted status transitions and the
 * projection writes are all exercised end to end.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createEventIndexer } from './eventIndexer.js';

const CONTRACT = 'CONTRACT_A';
const silent = { info() {}, warn() {}, error() {} };

async function setup({ confirmationDepth = 0 } = {}) {
  const db = new Database(':memory:');
  await runMigrations(db);
  const indexer = createEventIndexer({ db, confirmationDepth, logger: silent });
  return { db, indexer };
}

/** A `credit` event — `data` is the scalar amount, per docs/EVENT_SCHEMA.md. */
function credit({ ledger, txHash, amount = 100, eventIndex = 0, ...rest }) {
  return { topic: ['credit', 'USER_A'], data: amount, ledger, txHash, eventIndex, ...rest };
}

const rows = (db, sql, params = []) => db.prepare(sql).all(...params);
const one = (db, sql, params = []) => db.prepare(sql).get(...params);

// ── Confirmation depth ───────────────────────────────────────────────────────

test('depth 0 projects on arrival (unchanged pre-#981 behaviour)', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 0 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 100 });

  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-1']).status,
    'confirmed',
  );
  assert.equal(one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance, 100);
});

test('an event shallower than the confirmation depth stays tentative and unprojected', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  // Ledger 100 with the tip at 102 is only 2 deep — not yet safe.
  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 102 });

  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-1']).status,
    'tentative',
  );
  assert.equal(
    one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']),
    undefined,
    'no derived state depends on an unconfirmed event',
  );
});

test('an event already buried past the depth projects immediately', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 110 });

  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-1']).status,
    'confirmed',
  );
  assert.equal(one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance, 100);
});

test('confirmPending projects tentative events once the tip advances', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 101 });
  assert.equal(one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']), undefined);

  const promoted = await indexer.confirmPending(CONTRACT, 106);

  assert.equal(promoted, 1);
  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-1']).status,
    'confirmed',
  );
  assert.equal(one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance, 100);
});

test('confirmPending leaves events that are still too shallow alone', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 101 });

  assert.equal(await indexer.confirmPending(CONTRACT, 104), 0, 'ledger 100 is only 4 deep');
  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-1']).status,
    'tentative',
  );
});

test('confirmPending promotes in ledger then event-index order', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 3 });

  await indexer.processEvent(
    credit({ ledger: 101, txHash: 'tx-b', amount: 10, eventIndex: 1 }),
    CONTRACT,
    { tip: 101 },
  );
  await indexer.processEvent(
    credit({ ledger: 100, txHash: 'tx-a', amount: 5, eventIndex: 0 }),
    CONTRACT,
    { tip: 101 },
  );

  await indexer.confirmPending(CONTRACT, 110);

  const order = rows(db, 'SELECT tx_hash FROM credit_events ORDER BY id').map((r) => r.tx_hash);
  assert.deepEqual(order, ['tx-a', 'tx-b'], 'ledger 100 projects before ledger 101');
  assert.equal(one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance, 15);
});

test('the confirmed watermark advances with the tip', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 101 });
  await indexer.confirmPending(CONTRACT, 120);

  assert.equal(
    one(db, 'SELECT safe_ledger FROM indexer_state WHERE contract_id = ?', [CONTRACT]),
    undefined,
    'no cursor row yet, so nothing to advance',
  );

  // Once a cursor row exists the watermark is persisted on it.
  db.prepare(
    "INSERT INTO indexer_state (contract_id, cursor, last_ledger, updated_at) VALUES (?, 'c1', 120, datetime('now'))",
  ).run(CONTRACT);
  await indexer.confirmPending(CONTRACT, 130);

  assert.equal(
    one(db, 'SELECT safe_ledger FROM indexer_state WHERE contract_id = ?', [CONTRACT]).safe_ledger,
    125,
  );
});

// ── Reorg detection ──────────────────────────────────────────────────────────

test('a changed tx at a known (ledger, event_index) slot is a reorg', async () => {
  const { indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-old' }), CONTRACT, { tip: 101 });

  const reorg = await indexer.detectReorg(credit({ ledger: 100, txHash: 'tx-new' }), CONTRACT);

  assert.deepEqual(reorg, { forkLedger: 100, previousHash: 'tx-old', newHash: 'tx-new' });
});

test('re-seeing the same tx in the same slot is not a reorg', async () => {
  const { indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 101 });

  assert.equal(await indexer.detectReorg(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT), null);
});

test('a changed ledger hash is a reorg, and a matching one is not', async () => {
  const { indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(
    credit({ ledger: 100, txHash: 'tx-1', ledgerHash: 'hash-a' }),
    CONTRACT,
    { tip: 101 },
  );

  assert.equal(
    await indexer.detectReorg(
      credit({ ledger: 100, txHash: 'tx-2', eventIndex: 1, ledgerHash: 'hash-a' }),
      CONTRACT,
    ),
    null,
    'same ledger hash — a second event in the same ledger',
  );

  const reorg = await indexer.detectReorg(
    credit({ ledger: 100, txHash: 'tx-2', ledgerHash: 'hash-b' }),
    CONTRACT,
  );
  assert.deepEqual(reorg, { forkLedger: 100, previousHash: 'hash-a', newHash: 'hash-b' });
});

test('a ledger never seen before is not a reorg', async () => {
  const { indexer } = await setup({ confirmationDepth: 5 });

  assert.equal(await indexer.detectReorg(credit({ ledger: 500, txHash: 'tx-1' }), CONTRACT), null);
});

test('reorg detection is scoped per contract', async () => {
  const { indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-a' }), CONTRACT, { tip: 101 });

  assert.equal(
    await indexer.detectReorg(credit({ ledger: 100, txHash: 'tx-b' }), 'CONTRACT_B'),
    null,
    'a different contract has its own ledger history',
  );
});

// ── Rollback ─────────────────────────────────────────────────────────────────

test('a reorg reverts tentative events at and above the fork', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 101 });
  await indexer.processEvent(credit({ ledger: 101, txHash: 'tx-2' }), CONTRACT, { tip: 101 });
  await indexer.processEvent(credit({ ledger: 102, txHash: 'tx-3' }), CONTRACT, { tip: 102 });

  const result = await indexer.handleReorg(
    { forkLedger: 101, previousHash: 'a', newHash: 'b' },
    CONTRACT,
  );

  assert.equal(result.revertedCount, 2, 'ledgers 101 and 102 are unwound');
  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-1']).status,
    'tentative',
    'ledger 100 is below the fork and survives',
  );
  for (const tx of ['tx-2', 'tx-3']) {
    assert.equal(
      one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', [tx]).status,
      'reverted',
    );
  }
});

test('reverted events are never projected when the tip advances', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-keep', amount: 7 }), CONTRACT, {
    tip: 101,
  });
  await indexer.processEvent(credit({ ledger: 101, txHash: 'tx-drop', amount: 999 }), CONTRACT, {
    tip: 101,
  });

  await indexer.handleReorg({ forkLedger: 101 }, CONTRACT);
  await indexer.confirmPending(CONTRACT, 200);

  assert.equal(
    one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance,
    7,
    'only the surviving event reached the balance',
  );
  assert.equal(rows(db, 'SELECT id FROM credit_events').length, 1);
});

test('a reorg clears the stale ledger hashes at and above the fork', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(
    credit({ ledger: 100, txHash: 'tx-1', ledgerHash: 'h100' }),
    CONTRACT,
    { tip: 101 },
  );
  await indexer.processEvent(
    credit({ ledger: 101, txHash: 'tx-2', ledgerHash: 'h101' }),
    CONTRACT,
    { tip: 101 },
  );

  await indexer.handleReorg({ forkLedger: 101 }, CONTRACT);

  const remaining = rows(db, 'SELECT ledger FROM indexer_ledger_hashes WHERE contract_id = ?', [
    CONTRACT,
  ]).map((r) => r.ledger);
  assert.deepEqual(remaining, [100]);
});

test('a reorg rewinds ingestion to the confirmed watermark', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  db.prepare(
    `INSERT INTO indexer_state (contract_id, cursor, last_ledger, safe_ledger, updated_at)
     VALUES (?, 'cursor-99', 120, 95, datetime('now'))`,
  ).run(CONTRACT);

  await indexer.handleReorg({ forkLedger: 110 }, CONTRACT);

  const state = one(db, 'SELECT cursor, last_ledger FROM indexer_state WHERE contract_id = ?', [
    CONTRACT,
  ]);
  assert.equal(state.cursor, null, 'the invalidated cursor is dropped');
  assert.equal(state.last_ledger, 95, 'ingestion resumes from the watermark');
});

test('a reorg above the watermark is recorded as safe', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  db.prepare(
    `INSERT INTO indexer_state (contract_id, cursor, last_ledger, safe_ledger, updated_at)
     VALUES (?, 'c', 120, 100, datetime('now'))`,
  ).run(CONTRACT);

  const result = await indexer.handleReorg(
    { forkLedger: 110, previousHash: 'old', newHash: 'new' },
    CONTRACT,
  );

  assert.equal(result.breached, false);

  const logged = one(db, 'SELECT * FROM indexer_reorgs WHERE contract_id = ?', [CONTRACT]);
  assert.equal(logged.fork_ledger, 110);
  assert.equal(logged.previous_hash, 'old');
  assert.equal(logged.new_hash, 'new');
  assert.equal(logged.breached_confirmed, 0);
});

test('a reorg below the watermark is flagged as breaching confirmed state', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  db.prepare(
    `INSERT INTO indexer_state (contract_id, cursor, last_ledger, safe_ledger, updated_at)
     VALUES (?, 'c', 120, 100, datetime('now'))`,
  ).run(CONTRACT);

  const result = await indexer.handleReorg({ forkLedger: 90 }, CONTRACT);

  assert.equal(result.breached, true, 'the fork is deeper than the confirmation depth');
  assert.equal(
    one(db, 'SELECT breached_confirmed FROM indexer_reorgs WHERE contract_id = ?', [CONTRACT])
      .breached_confirmed,
    1,
  );
});

test('with depth 0 every reorg breaches, because everything was projected on arrival', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 0 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-old' }), CONTRACT, { tip: 100 });
  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-new' }), CONTRACT, { tip: 100 });

  const logged = one(db, 'SELECT breached_confirmed FROM indexer_reorgs WHERE contract_id = ?', [
    CONTRACT,
  ]);
  assert.ok(logged, 'the reorg is still detected without a confirmation depth');
  assert.equal(logged.breached_confirmed, 1);
});

// ── Ingestion wires detection into the write path ────────────────────────────

test('processEvent detects and unwinds a fork before storing the replacement', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-old' }), CONTRACT, { tip: 101 });
  await indexer.processEvent(credit({ ledger: 101, txHash: 'tx-orphan' }), CONTRACT, { tip: 101 });

  // The replacement fork puts a different tx in ledger 100's slot 0.
  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-new' }), CONTRACT, { tip: 101 });

  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-old']).status,
    'reverted',
  );
  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-orphan']).status,
    'reverted',
  );
  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-new']).status,
    'tentative',
    'the replacement is stored fresh and awaits confirmation',
  );

  await indexer.confirmPending(CONTRACT, 200);
  assert.equal(
    one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance,
    100,
    'only the surviving fork is projected',
  );
});

test('an already-indexed event is skipped without re-running its projection', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 0 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 100 });
  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 100 });

  assert.equal(
    one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance,
    100,
    'idempotent — the credit is applied once',
  );
  assert.equal(rows(db, 'SELECT id FROM indexed_events').length, 1);
});

// ── Health and metrics ───────────────────────────────────────────────────────

test('health reports degraded while an unresolved breach is on record', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  assert.equal((await indexer.getHealth()).status, 'idle');

  db.prepare(
    `INSERT INTO indexer_state (contract_id, cursor, last_ledger, safe_ledger, updated_at)
     VALUES (?, 'c', 120, 100, datetime('now'))`,
  ).run(CONTRACT);
  await indexer.handleReorg({ forkLedger: 90 }, CONTRACT);

  const health = await indexer.getHealth();
  assert.equal(health.status, 'degraded');
  assert.equal(health.reorgsUnsafe, 1);
  assert.equal(health.confirmationDepth, 5);
});

test('health clears once the breach is marked resolved', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  db.prepare(
    `INSERT INTO indexer_state (contract_id, cursor, last_ledger, safe_ledger, updated_at)
     VALUES (?, 'c', 120, 100, datetime('now'))`,
  ).run(CONTRACT);
  await indexer.handleReorg({ forkLedger: 90 }, CONTRACT);
  db.prepare("UPDATE indexer_reorgs SET resolved_at = datetime('now')").run();

  assert.notEqual((await indexer.getHealth()).status, 'degraded');
});

test('metrics expose the reorg counters', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });

  await indexer.processEvent(credit({ ledger: 100, txHash: 'tx-1' }), CONTRACT, { tip: 101 });
  await indexer.handleReorg({ forkLedger: 100 }, CONTRACT);

  const metrics = indexer.getMetrics();
  assert.equal(metrics.indexer_reorgs_total, 1);
  assert.equal(metrics.indexer_events_reverted_total, 1);
  assert.equal(metrics.indexer_confirmation_depth, 5);
  assert.equal(one(db, 'SELECT COUNT(*) AS n FROM indexer_reorgs').n, 1);
});

test('a negative or non-numeric confirmation depth falls back to 0', async () => {
  const { indexer } = await setup({ confirmationDepth: -5 });
  assert.equal(indexer.confirmationDepth, 0);

  const { indexer: nan } = await setup({ confirmationDepth: 'abc' });
  assert.equal(nan.confirmationDepth, 0);
});

// ── Polling ──────────────────────────────────────────────────────────────────

function makeRpcPool(pages) {
  const requests = [];
  const rpc = {
    async getEvents(request) {
      requests.push(request);
      return pages.shift() ?? { events: [], nextCursor: null, latestLedger: 0 };
    },
  };
  return { requests, acquire: async () => rpc, release() {} };
}

test('poll uses the tip from the RPC to decide what is confirmed', async () => {
  const { db, indexer } = await setup({ confirmationDepth: 5 });
  const rpcPool = makeRpcPool([
    {
      events: [credit({ ledger: 100, txHash: 'tx-old-enough' })],
      nextCursor: 'c1',
      latestLedger: 200,
    },
  ]);
  const polling = createEventIndexer({ db, rpcPool, confirmationDepth: 5, logger: silent });

  await polling.poll(CONTRACT, null);

  assert.equal(
    one(db, 'SELECT status FROM indexed_events WHERE tx_hash = ?', ['tx-old-enough']).status,
    'confirmed',
  );
  assert.equal(one(db, 'SELECT balance FROM balances WHERE user = ?', ['USER_A']).balance, 100);
  void indexer;
});

test('poll resumes from the watermark when the cursor was dropped by a reorg', async () => {
  const { db } = await setup({ confirmationDepth: 5 });
  db.prepare(
    `INSERT INTO indexer_state (contract_id, cursor, last_ledger, safe_ledger, updated_at)
     VALUES (?, NULL, 95, 95, datetime('now'))`,
  ).run(CONTRACT);

  const rpcPool = makeRpcPool([{ events: [], nextCursor: null, latestLedger: 120 }]);
  const indexer = createEventIndexer({ db, rpcPool, confirmationDepth: 5, logger: silent });

  await indexer.poll(CONTRACT, null);

  assert.equal(rpcPool.requests[0].startLedger, 96, 'reads from the ledger after the watermark');
  assert.equal(rpcPool.requests[0].cursor, undefined);
});

test('poll prefers an explicit cursor over the watermark', async () => {
  const { db } = await setup({ confirmationDepth: 5 });
  db.prepare(
    `INSERT INTO indexer_state (contract_id, cursor, last_ledger, safe_ledger, updated_at)
     VALUES (?, 'cur-1', 120, 95, datetime('now'))`,
  ).run(CONTRACT);

  const rpcPool = makeRpcPool([{ events: [], nextCursor: null, latestLedger: 120 }]);
  const indexer = createEventIndexer({ db, rpcPool, confirmationDepth: 5, logger: silent });

  await indexer.poll(CONTRACT, 'cur-1');

  assert.equal(rpcPool.requests[0].cursor, 'cur-1');
  assert.equal(rpcPool.requests[0].startLedger, undefined);
});
