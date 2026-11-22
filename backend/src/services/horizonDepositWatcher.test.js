import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createHorizonDepositWatcher, parseDeposit } from './horizonDepositWatcher.js';

const CUSTODY = 'GCUSTODY1111111111111111111111111111111111111111111111';
const OTHER_CUSTODY = 'GCUSTODY2222222222222222222222222222222222222222222222';
const OPERATOR = 'GOPERATOR111111111111111111111111111111111111111111111';
const ISSUER = 'GISSUER1111111111111111111111111111111111111111111111111';
const REWARD = { code: 'TRV', issuer: ISSUER };

function payment(overrides = {}) {
  return {
    type: 'payment',
    paging_token: '1001',
    from: OPERATOR,
    to: CUSTODY,
    asset_type: 'credit_alphanum4',
    asset_code: 'TRV',
    asset_issuer: ISSUER,
    amount: '250.0000000',
    transaction_hash: 'tx-1',
    transaction_successful: true,
    created_at: '2026-09-26T00:00:00Z',
    ...overrides,
  };
}

const watched = new Set([CUSTODY, OTHER_CUSTODY]);

test('parseDeposit: accepts an incoming reward-token payment', () => {
  const d = parseDeposit(payment(), { watched, asset: REWARD });
  assert.deepEqual(d, {
    pagingToken: '1001',
    account: CUSTODY,
    from: OPERATOR,
    assetCode: 'TRV',
    assetIssuer: ISSUER,
    amount: '250.0000000',
    txHash: 'tx-1',
    verified: true,
    observedAt: '2026-09-26T00:00:00Z',
  });
});

test('parseDeposit: ignores other assets, wrong issuers, outgoing and internal transfers', () => {
  const opts = { watched, asset: REWARD };
  assert.equal(parseDeposit(payment({ asset_code: 'USDC' }), opts), null);
  assert.equal(
    parseDeposit(payment({ asset_issuer: 'GFAKE' }), opts),
    null,
    'same code, different issuer',
  );
  assert.equal(parseDeposit(payment({ asset_type: 'native', asset_code: undefined }), opts), null);
  assert.equal(parseDeposit(payment({ from: CUSTODY, to: OPERATOR }), opts), null, 'outgoing');
  assert.equal(
    parseDeposit(payment({ from: OTHER_CUSTODY }), opts),
    null,
    'between custody accounts',
  );
  assert.equal(parseDeposit(payment({ to: 'GSOMEONEELSE' }), opts), null);
  assert.equal(parseDeposit(payment({ amount: '0.0000000' }), opts), null);
  assert.equal(parseDeposit({ type: 'manage_offer', paging_token: '1' }, opts), null);
  assert.equal(parseDeposit(null, opts), null);
});

test('parseDeposit: native XLM deposits, create_account and path payments', () => {
  const native = { watched, asset: { code: 'XLM' } };
  assert.equal(
    parseDeposit(
      payment({ asset_type: 'native', asset_code: undefined, asset_issuer: undefined }),
      native,
    )?.assetCode,
    'XLM',
  );
  const created = parseDeposit(
    {
      type: 'create_account',
      paging_token: '7',
      funder: OPERATOR,
      account: CUSTODY,
      starting_balance: '5.0',
      transaction_hash: 'tx-c',
    },
    native,
  );
  assert.equal(created?.amount, '5.0');
  const path = parseDeposit(payment({ type: 'path_payment_strict_receive' }), {
    watched,
    asset: REWARD,
  });
  assert.equal(path?.amount, '250.0000000');
});

test('parseDeposit: marks unsuccessful transactions as unverified', () => {
  const d = parseDeposit(payment({ transaction_successful: false }), { watched, asset: REWARD });
  assert.equal(d?.verified, false);
});

async function makeWatcher(extra = {}) {
  const db = new Database(':memory:');
  await runMigrations(db);
  const watcher = createHorizonDepositWatcher({
    db,
    horizonUrl: 'https://horizon.test',
    accounts: [CUSTODY, OTHER_CUSTODY],
    asset: REWARD,
    logger: { info() {}, warn() {}, error() {} },
    ...extra,
  });
  return { db, watcher };
}

test('handleRecord: records a deposit once and de-duplicates replays', async () => {
  const seen = [];
  const { watcher } = await makeWatcher({ onDeposit: (d) => seen.push(d) });

  const first = watcher.handleRecord(payment(), CUSTODY);
  assert.equal(first.duplicate, false);
  const replay = watcher.handleRecord(payment(), CUSTODY);
  assert.equal(replay.duplicate, true);

  assert.equal(seen.length, 1, 'onDeposit fires only for new deposits');
  const list = watcher.listDeposits({ account: CUSTODY });
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, '250.0000000');
  assert.equal(list[0].verified, true);
  assert.equal(watcher.getStatus().depositsRecorded, 1);
  assert.equal(watcher.getStatus().duplicates, 1);
});

test('handleRecord: ignored records still advance the stream cursor', async () => {
  const { db, watcher } = await makeWatcher();
  const outgoing = payment({ paging_token: '2002', from: CUSTODY, to: OPERATOR });
  assert.equal(watcher.handleRecord(outgoing, CUSTODY), null);

  assert.equal(watcher.listDeposits().length, 0);
  const row = db
    .prepare('SELECT cursor FROM horizon_watcher_cursors WHERE account = ?')
    .get(CUSTODY);
  assert.equal(row.cursor, '2002');
});

test('getByTxHash: verifies a deposit by transaction hash', async () => {
  const { watcher } = await makeWatcher();
  watcher.handleRecord(payment({ transaction_hash: 'abc' }), CUSTODY);
  assert.equal(watcher.getByTxHash('abc').length, 1);
  assert.equal(watcher.getByTxHash('missing').length, 0);
});

function fakeHorizon() {
  const streams = [];
  const factory = () => ({
    payments: () => ({
      forAccount: (account) => ({
        cursor: (cursor) => ({
          stream: (handlers) => {
            const entry = { account, cursor, handlers, closed: false };
            streams.push(entry);
            return () => {
              entry.closed = true;
            };
          },
        }),
      }),
    }),
  });
  return { streams, factory };
}

test('start/stop: streams each account from "now", persists cursors and resumes from them', async () => {
  const fake = fakeHorizon();
  const { watcher, db } = await makeWatcher({ serverFactory: fake.factory });

  watcher.start();
  assert.equal(fake.streams.length, 2);
  assert.deepEqual(
    fake.streams.map((s) => s.cursor),
    ['now', 'now'],
  );

  const custody = fake.streams.find((s) => s.account === CUSTODY);
  custody.handlers.onmessage(payment({ paging_token: '3003' }));
  assert.equal(watcher.listDeposits().length, 1);
  assert.equal(watcher.getStatus().accounts.find((a) => a.account === CUSTODY).cursor, '3003');

  watcher.stop();
  assert.ok(fake.streams.every((s) => s.closed));
  assert.equal(watcher.getStatus().running, false);

  // A fresh watcher on the same database resumes from the saved cursor.
  const second = fakeHorizon();
  const resumed = createHorizonDepositWatcher({
    db,
    horizonUrl: 'https://horizon.test',
    accounts: [CUSTODY],
    asset: REWARD,
    serverFactory: second.factory,
    logger: {},
  });
  resumed.start();
  assert.equal(second.streams[0].cursor, '3003');
  resumed.stop();
});

test('stream errors close the stream and reconnect with backoff', async () => {
  const fake = fakeHorizon();
  const { watcher } = await makeWatcher({
    serverFactory: fake.factory,
    reconnectBaseMs: 5,
    reconnectMaxMs: 20,
  });

  watcher.start();
  const first = fake.streams[0];
  first.handlers.onerror(new Error('boom'));
  assert.equal(first.closed, true);
  assert.equal(watcher.getStatus().errors, 1);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(fake.streams.length > 2, 'a new stream was opened for the failed account');
  watcher.stop();
});

test('a throwing serverFactory is retried instead of crashing the process', async () => {
  let calls = 0;
  const { watcher } = await makeWatcher({
    serverFactory: () => {
      calls++;
      throw new Error('bad horizon url');
    },
    reconnectBaseMs: 5,
    reconnectMaxMs: 10,
  });
  watcher.start();
  await new Promise((resolve) => setTimeout(resolve, 40));
  watcher.stop();
  assert.ok(calls > 2, 'connect was retried');
});
