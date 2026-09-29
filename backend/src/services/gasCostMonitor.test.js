import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import {
  Account,
  Asset,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { runMigrations } from '../db/migrate.js';
import { createGasCostRoutes } from '../routes/gasCosts.js';
import {
  createGasCostMonitor,
  decodeInvocation,
  parseStroops,
  parseTxFee,
  percentile,
  stroopsToXlm,
} from './gasCostMonitor.js';

const SUBMITTER = 'GSUBMITTER11111111111111111111111111111111111111111111';
const CONTRACT_A = 'CCONTRACTA';
const CONTRACT_B = 'CCONTRACTB';
const silent = { info() {}, warn() {}, error() {} };

/** Fake decoder: envelope_xdr is "contract:function" or "none". */
const fakeDecode = (xdr) => {
  if (xdr === 'none') return null;
  if (xdr === 'bad') throw new Error('malformed xdr');
  const [contractId, functionName] = xdr.split(':');
  return { contractId: contractId || null, functionName: functionName || null };
};

function txRecord(overrides = {}) {
  return {
    hash: 'tx-1',
    paging_token: '100',
    source_account: SUBMITTER,
    fee_account: SUBMITTER,
    fee_charged: '12345',
    max_fee: '100000',
    successful: true,
    ledger: 42,
    envelope_xdr: `${CONTRACT_A}:claim`,
    created_at: '2026-09-28T10:00:00Z',
    ...overrides,
  };
}

test('stroopsToXlm: exact 7-decimal conversion', () => {
  assert.equal(stroopsToXlm(0), '0.0000000');
  assert.equal(stroopsToXlm(100), '0.0000100');
  assert.equal(stroopsToXlm(10_000_000), '1.0000000');
  assert.equal(stroopsToXlm(123_456_789), '12.3456789');
  assert.equal(stroopsToXlm(-5), '-0.0000005');
});

test('parseStroops: accepts integer strings, rejects malformed input', () => {
  assert.equal(parseStroops('100'), 100);
  assert.equal(parseStroops(250), 250);
  for (const bad of [undefined, null, '', '-1', '1.5', 'abc', '99999999999999999999']) {
    assert.equal(parseStroops(bad), null, String(bad));
  }
});

test('percentile: nearest-rank', () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([7], 95), 7);
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 95);
  assert.equal(percentile(sorted, 100), 100);
});

test('parseTxFee: maps a Horizon contract transaction', () => {
  assert.deepEqual(parseTxFee(txRecord(), { decode: fakeDecode }), {
    txHash: 'tx-1',
    sourceAccount: SUBMITTER,
    feeAccount: SUBMITTER,
    contractId: CONTRACT_A,
    functionName: 'claim',
    feeCharged: 12345,
    maxFee: 100000,
    feeBump: false,
    successful: true,
    ledger: 42,
    createdAt: '2026-09-28T10:00:00Z',
  });
});

test('parseTxFee: skips non-contract, malformed and filtered transactions', () => {
  const opts = { decode: fakeDecode };
  assert.equal(parseTxFee(null, opts), null);
  assert.equal(parseTxFee(txRecord({ envelope_xdr: 'none' }), opts), null, 'classic tx');
  assert.equal(parseTxFee(txRecord({ envelope_xdr: 'bad' }), opts), null, 'decode error');
  assert.equal(parseTxFee(txRecord({ envelope_xdr: undefined }), opts), null);
  assert.equal(parseTxFee(txRecord({ fee_charged: 'NaN' }), opts), null);
  assert.equal(parseTxFee(txRecord({ max_fee: undefined }), opts), null);
  assert.equal(
    parseTxFee(txRecord(), { decode: fakeDecode, contracts: new Set([CONTRACT_B]) }),
    null,
    'not in contract allowlist',
  );
});

test('parseTxFee: records failed and fee-bumped transactions', () => {
  const fee = parseTxFee(
    txRecord({ successful: false, fee_bump_transaction: { hash: 'outer' }, fee_account: 'GFEE' }),
    { decode: fakeDecode },
  );
  assert.equal(fee?.successful, false);
  assert.equal(fee?.feeBump, true);
  assert.equal(fee?.feeAccount, 'GFEE');
});

test('decodeInvocation: extracts contract and function from a real envelope', () => {
  const source = Keypair.random();
  const contract = new Contract('CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE');
  const build = (op) =>
    new TransactionBuilder(new Account(source.publicKey(), '1'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

  const invoke = build(contract.call('claim', nativeToScVal(1, { type: 'u32' })));
  assert.deepEqual(decodeInvocation(invoke.toXDR(), Networks.TESTNET), {
    contractId: contract.contractId(),
    functionName: 'claim',
  });

  const bumped = TransactionBuilder.buildFeeBumpTransaction(
    source,
    '1000',
    invoke,
    Networks.TESTNET,
  );
  assert.equal(decodeInvocation(bumped.toXDR(), Networks.TESTNET)?.functionName, 'claim');

  const payment = build(
    Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: '1',
    }),
  );
  assert.equal(decodeInvocation(payment.toXDR(), Networks.TESTNET), null);
});

/** Fake Horizon server returning canned pages per (order, cursor). */
function fakeHorizon(pagesByCursor, { latest = [], fail = false } = {}) {
  const calls = [];
  const server = {
    transactions() {
      const q = { account: null, cursor: null, order: null, limit: null };
      const builder = {
        forAccount(a) {
          q.account = a;
          return builder;
        },
        cursor(c) {
          q.cursor = c;
          return builder;
        },
        order(o) {
          q.order = o;
          return builder;
        },
        limit(l) {
          q.limit = l;
          return builder;
        },
        async call() {
          calls.push({ ...q });
          if (fail) throw new Error('horizon down');
          if (q.order === 'desc') return { records: latest };
          return { records: pagesByCursor[q.cursor] ?? [] };
        },
      };
      return builder;
    },
  };
  return { server, calls };
}

async function makeMonitor(extra = {}) {
  const db = new Database(':memory:');
  await runMigrations(db);
  const monitor = createGasCostMonitor({
    db,
    horizonUrl: 'https://horizon.test',
    networkPassphrase: Networks.TESTNET,
    accounts: [SUBMITTER],
    decode: fakeDecode,
    logger: silent,
    ...extra,
  });
  return { db, monitor };
}

test('recordTransaction: idempotent by tx hash and fires onFee once', async () => {
  const seen = [];
  const { monitor } = await makeMonitor({ onFee: (f) => seen.push(f.txHash) });
  assert.equal(monitor.recordTransaction(txRecord())?.duplicate, false);
  assert.equal(monitor.recordTransaction(txRecord())?.duplicate, true);
  assert.equal(monitor.recordTransaction(txRecord({ envelope_xdr: 'none' })), null);
  assert.deepEqual(seen, ['tx-1']);
  const status = monitor.getStatus();
  assert.equal(status.feesRecorded, 1);
  assert.equal(status.duplicates, 1);
  assert.equal(status.skipped, 1);
});

test('runOnce: anchors cursor at latest tx on first run, then pages forward', async () => {
  const { server, calls } = fakeHorizon(
    {
      500: [
        txRecord({ hash: 'a', paging_token: '501' }),
        txRecord({ hash: 'b', paging_token: '502', envelope_xdr: 'none' }),
      ],
      502: [txRecord({ hash: 'c', paging_token: '503' })],
    },
    { latest: [{ paging_token: '500' }] },
  );
  const { monitor } = await makeMonitor({ serverFactory: () => server, pageSize: 2 });

  const result = await monitor.runOnce();
  assert.equal(result.recorded, 2);
  assert.deepEqual(
    calls.map((c) => [c.order, c.cursor]),
    [
      ['desc', null],
      ['asc', '500'],
      ['asc', '502'],
    ],
  );
  assert.equal(monitor.getStatus().accounts[0].cursor, '503');

  // Second run resumes from the persisted cursor, with no history re-scan.
  calls.length = 0;
  assert.equal((await monitor.runOnce()).recorded, 0);
  assert.deepEqual(calls.map((c) => [c.order, c.cursor]), [['asc', '503']]);
});

test('runOnce: empty account starts from cursor 0 and survives Horizon errors', async () => {
  const { server } = fakeHorizon({}, { latest: [] });
  const { monitor } = await makeMonitor({ serverFactory: () => server });
  await monitor.runOnce();
  assert.equal(monitor.getStatus().accounts[0].cursor, '0');

  const failing = fakeHorizon({}, { fail: true });
  const { monitor: broken } = await makeMonitor({ serverFactory: () => failing.server });
  const result = await broken.runOnce();
  assert.equal(result.recorded, 0);
  const status = broken.getStatus();
  assert.equal(status.errors, 1);
  assert.equal(status.lastError?.account, SUBMITTER);
  assert.match(status.lastError?.message ?? '', /horizon down/);
});

test('start: no-op without accounts', async () => {
  const { monitor } = await makeMonitor({ accounts: [] });
  monitor.start();
  assert.equal(monitor.getStatus().running, false);
});

async function seeded() {
  const ctx = await makeMonitor();
  const rows = [
    ['t1', `${CONTRACT_A}:claim`, '100', '2026-09-27T01:00:00Z', true],
    ['t2', `${CONTRACT_A}:claim`, '300', '2026-09-27T02:00:00Z', true],
    ['t3', `${CONTRACT_B}:register`, '200', '2026-09-28T01:00:00Z', false],
    ['t4', `${CONTRACT_B}:register`, '400', '2026-09-28T02:00:00Z', true],
  ];
  for (const [hash, xdr, fee, at, ok] of rows) {
    ctx.monitor.recordTransaction(
      txRecord({ hash, envelope_xdr: xdr, fee_charged: fee, created_at: at, successful: ok }),
    );
  }
  return ctx;
}

test('getSummary: totals, percentiles and per-contract breakdown', async () => {
  const { monitor } = await seeded();
  const summary = monitor.getSummary();
  assert.equal(summary.count, 4);
  assert.equal(summary.totalStroops, 1000);
  assert.equal(summary.totalXlm, '0.0001000');
  assert.equal(summary.failedCount, 1);
  assert.deepEqual(summary.stroops, { min: 100, max: 400, avg: 250, p50: 200, p95: 400, p99: 400 });
  assert.deepEqual(
    summary.contracts.map((c) => [c.contractId, c.count, c.totalStroops]),
    [
      [CONTRACT_B, 2, 600],
      [CONTRACT_A, 2, 400],
    ],
  );

  const windowed = monitor.getSummary({ since: '2026-09-28T00:00:00Z' });
  assert.equal(windowed.count, 2);
  assert.equal(monitor.getSummary({ contractId: CONTRACT_A }).totalStroops, 400);
  assert.equal(monitor.getSummary({ since: '2030-01-01T00:00:00Z' }).count, 0);
});

test('getDailyBreakdown, listTransactions and metrics snapshot', async () => {
  const { monitor } = await seeded();
  assert.deepEqual(
    monitor.getDailyBreakdown().map((d) => [d.day, d.count, d.totalStroops, d.maxStroops]),
    [
      ['2026-09-28', 2, 600, 400],
      ['2026-09-27', 2, 400, 300],
    ],
  );
  assert.equal(monitor.getDailyBreakdown({ days: 1 }).length, 1);

  const all = monitor.listTransactions();
  assert.deepEqual(
    all.map((t) => t.txHash),
    ['t4', 't3', 't2', 't1'],
  );
  assert.equal(all[0].feeChargedXlm, '0.0000400');
  const page = monitor.listTransactions({ beforeId: all[1].id, limit: 1 });
  assert.deepEqual(
    page.map((t) => t.txHash),
    ['t2'],
  );
  assert.equal(monitor.listTransactions({ contractId: CONTRACT_A }).length, 2);
  assert.deepEqual(monitor.getMetricsSnapshot(), { txCount: 4, feeStroopsTotal: 1000 });
});

test('routes: summary validation and read endpoints', async () => {
  const { monitor } = await seeded();
  const app = express();
  app.use('/gas', createGasCostRoutes({ monitor }));

  const ok = await request(app).get('/gas/summary?since=2026-09-28T00:00:00Z');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.count, 2);

  assert.equal((await request(app).get('/gas/summary?since=not-a-date')).status, 400);
  assert.equal(
    (await request(app).get('/gas/summary?since=2026-09-29T00:00:00Z&until=2026-09-28T00:00:00Z'))
      .status,
    400,
  );

  const daily = await request(app).get('/gas/daily?days=7');
  assert.equal(daily.body.total, 2);
  const txs = await request(app).get(`/gas/transactions?contractId=${CONTRACT_B}`);
  assert.equal(txs.body.total, 2);
  const status = await request(app).get('/gas/status');
  assert.equal(status.body.feesRecorded, 4);
});
