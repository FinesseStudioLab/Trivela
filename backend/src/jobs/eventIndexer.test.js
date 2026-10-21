import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventIndexer } from './eventIndexer.js';

/**
 * Minimal db mock that records every `run` call. `insertChanges` controls what
 * the first `referral_credits` insert reports so we can exercise the idempotency
 * branch.
 */
function makeDb({ insertChanges = 1 } = {}) {
  const calls = [];
  return {
    calls,
    async run(sql, params) {
      calls.push({ sql, params });
      if (/referral_credits/.test(sql)) return { changes: insertChanges };
      return { changes: 1 };
    },
  };
}

/**
 * Writes the projection handlers made, with the `indexed_events` archive row
 * filtered out. Every ingested event is archived regardless of what its handler
 * decides to do, so counting raw writes would conflate the two.
 */
function projections(db) {
  return db.calls.filter((call) => !/indexed_events/.test(call.sql));
}

const REFERRED = (overrides = {}) => ({
  topic: ['referred', 'REFEREE_ADDR', 'REFERRER_ADDR'],
  ledger: 42,
  txHash: '0xfeed',
  ...overrides,
});

test('referred event auto-credits the referrer bonus (issue #455)', async () => {
  const db = makeDb();
  const indexer = createEventIndexer({ db, referralBonus: 50 });

  await indexer.processEvent(REFERRED());

  const sqls = db.calls.map((c) => c.sql).join('\n');
  assert.match(sqls, /referral_credits/, 'records the referral edge');
  assert.match(sqls, /balance = balance \+/, 'bumps the referrer balance');

  const credit = db.calls.find((c) => /credit_events/.test(c.sql));
  assert.ok(credit, 'writes a credit_events row');
  assert.deepEqual(credit.params, ['REFERRER_ADDR', '50', 42, '0xfeed']);
});

test('zero bonus records the edge but issues no credit', async () => {
  const db = makeDb();
  const indexer = createEventIndexer({ db, referralBonus: 0 });

  await indexer.processEvent(REFERRED());

  const writes = projections(db);
  assert.equal(writes.length, 1, 'only the referral_credits insert runs');
  assert.match(writes[0].sql, /referral_credits/);
});

test('re-indexing the same referral does not double-credit', async () => {
  const db = makeDb({ insertChanges: 0 });
  const indexer = createEventIndexer({ db, referralBonus: 50 });

  await indexer.processEvent(REFERRED());

  assert.equal(projections(db).length, 1, 'ignored insert short-circuits the credit');
});

test('malformed referred event (missing referrer) is ignored', async () => {
  const db = makeDb();
  const indexer = createEventIndexer({ db, referralBonus: 50 });

  await indexer.processEvent(REFERRED({ topic: ['referred', 'REFEREE_ADDR'] }));

  assert.equal(projections(db).length, 0, 'no projection for an incomplete event');
});

// ── Referral bonus instrumentation (issue #656) ──────────────────────────────

const REF_BONUS = (overrides = {}) => ({
  topic: ['refbonus', 'REFERRER_ADDR', 'REFEREE_ADDR'],
  data: [100, 1000],
  ledger: 7,
  txHash: '0xbeef',
  ...overrides,
});

test('refbonus event records a referral_bonus_events row (issue #656)', async () => {
  const db = makeDb();
  const indexer = createEventIndexer({ db });

  await indexer.processEvent(REF_BONUS());

  const writes = projections(db);
  assert.equal(writes.length, 1, 'a single instrumentation insert runs');
  assert.match(writes[0].sql, /referral_bonus_events/);
  assert.deepEqual(
    writes[0].params.slice(0, 5),
    ['REFERRER_ADDR', 'REFEREE_ADDR', '100', '1000', 7],
    'records referrer, referee, bonus, qualifying amount, ledger',
  );
});

test('refbonus event never touches balances (the credit event owns that)', async () => {
  const db = makeDb();
  const indexer = createEventIndexer({ db });

  await indexer.processEvent(REF_BONUS());

  const sqls = db.calls.map((c) => c.sql).join('\n');
  assert.doesNotMatch(sqls, /balance = balance/, 'no balance mutation -> no double credit');
});

test('refbonus event with missing topics is ignored', async () => {
  const db = makeDb();
  const indexer = createEventIndexer({ db });

  await indexer.processEvent({ topic: ['refbonus'], data: [1, 2] });

  assert.equal(projections(db).length, 0);
});

// ── pollWithCursor: backpressure + exactly-once (issue #753) ──────────────────

/**
 * DB mock that also supports `get()` (returns the cursor row) and tracks which
 * processed_events inserts saw `changes === 0` (simulating already-seen events).
 */
function makeCursorDb({ storedCursor = null, alreadyProcessed = new Set() } = {}) {
  const calls = [];
  return {
    calls,
    async get(sql, _params) {
      calls.push({ sql, type: 'get' });
      if (/indexer_cursors/.test(sql)) return storedCursor ? { cursor: storedCursor } : undefined;
      return undefined;
    },
    async run(sql, params) {
      calls.push({ sql, params, type: 'run' });
      if (/processed_events/.test(sql) && alreadyProcessed.has(`${params[1]}:${params[2]}`)) {
        return { changes: 0 };
      }
      return { changes: 1 };
    },
  };
}

function makeMockRpcPool(events = [], nextCursor = 'cursor:99') {
  return {
    async acquire() {
      return {
        async getEvents() {
          return { events, nextCursor };
        },
      };
    },
    release() {},
  };
}

test('pollWithCursor loads stored cursor on startup and resumes from it (issue #753)', async () => {
  const db = makeCursorDb({ storedCursor: 'cursor:42' });
  const rpcPool = makeMockRpcPool([], 'cursor:43');
  const indexer = createEventIndexer({ db, rpcPool });

  await indexer.pollWithCursor('CONTRACT_A');

  const getCursorCall = db.calls.find((c) => c.type === 'get' && /indexer_cursors/.test(c.sql));
  assert.ok(getCursorCall, 'reads the stored cursor');
});

test('pollWithCursor persists nextCursor after a batch (issue #753)', async () => {
  const db = makeCursorDb();
  const events = [{ topic: ['credit', 'USER'], data: 100, ledger: 5 }];
  const rpcPool = makeMockRpcPool(events, 'cursor:next');
  const indexer = createEventIndexer({ db, rpcPool });

  await indexer.pollWithCursor('CONTRACT_A');

  const saveCursorCall = db.calls.find(
    (c) => c.type === 'run' && /indexer_cursors/.test(c.sql) && /DO UPDATE/.test(c.sql),
  );
  assert.ok(saveCursorCall, 'upserts the cursor after processing');
  assert.equal(saveCursorCall.params[1], 'cursor:next', 'saves the correct next cursor');
});

test('pollWithCursor skips already-processed events without re-handling them (issue #753)', async () => {
  // Mark ledger=5, eventIndex=0 as already processed
  const db = makeCursorDb({ alreadyProcessed: new Set(['5:0']) });
  const events = [{ topic: ['credit', 'USER'], data: 100, ledger: 5 }];
  const rpcPool = makeMockRpcPool(events, 'cursor:next');
  const indexer = createEventIndexer({ db, rpcPool });

  await indexer.pollWithCursor('CONTRACT_A');

  // The credit handler writes to `balances` — it must NOT appear since the
  // event was already processed (dedupe short-circuited).
  const balanceWrite = db.calls.find((c) => /balances/.test(c.sql));
  assert.ok(!balanceWrite, 'already-processed event is not re-applied');
});

test('pollWithCursor returns nextCursor (issue #753)', async () => {
  const db = makeCursorDb();
  const rpcPool = makeMockRpcPool([], 'cursor:end');
  const indexer = createEventIndexer({ db, rpcPool });

  const result = await indexer.pollWithCursor('CONTRACT_A');
  assert.equal(result, 'cursor:end');
});

test('pollWithCursor processes multiple events in a batch (issue #753)', async () => {
  const db = makeCursorDb();
  const events = [
    { topic: ['credit', 'USER_A'], data: 50, ledger: 10 },
    { topic: ['credit', 'USER_B'], data: 75, ledger: 10 },
  ];
  const rpcPool = makeMockRpcPool(events, 'cursor:11');
  const indexer = createEventIndexer({ db, rpcPool });

  await indexer.pollWithCursor('CONTRACT_A');

  const processedInserts = db.calls.filter((c) => /processed_events/.test(c.sql));
  assert.equal(processedInserts.length, 2, 'one dedupe insert per event');
});
