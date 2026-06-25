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

  assert.equal(db.calls.length, 1, 'only the referral_credits insert runs');
  assert.match(db.calls[0].sql, /referral_credits/);
});

test('re-indexing the same referral does not double-credit', async () => {
  const db = makeDb({ insertChanges: 0 });
  const indexer = createEventIndexer({ db, referralBonus: 50 });

  await indexer.processEvent(REFERRED());

  assert.equal(db.calls.length, 1, 'ignored insert short-circuits the credit');
});

test('malformed referred event (missing referrer) is ignored', async () => {
  const db = makeDb();
  const indexer = createEventIndexer({ db, referralBonus: 50 });

  await indexer.processEvent(REFERRED({ topic: ['referred', 'REFEREE_ADDR'] }));

  assert.equal(db.calls.length, 0, 'no writes for an incomplete event');
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

  assert.equal(db.calls.length, 1, 'a single instrumentation insert runs');
  assert.match(db.calls[0].sql, /referral_bonus_events/);
  assert.deepEqual(
    db.calls[0].params.slice(0, 5),
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

  assert.equal(db.calls.length, 0);
});
