import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair, Networks, StrKey } from '@stellar/stellar-sdk';
import {
  createSorobanTransactionBuilder,
  SorobanTransactionError,
} from './sorobanTransactionBuilder.js';

const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 7));
const source = Keypair.random();

function makeServer(overrides = {}) {
  const calls = { getAccount: 0, simulate: 0, send: 0, get: 0 };
  const server = {
    calls,
    async getAccount() {
      calls.getAccount += 1;
      return { sequenceNumber: () => '100' };
    },
    async simulateTransaction() {
      calls.simulate += 1;
      return {};
    },
    async sendTransaction() {
      calls.send += 1;
      return { status: 'PENDING', hash: 'abc123' };
    },
    async getTransaction() {
      calls.get += 1;
      return { status: 'SUCCESS', ledger: 7 };
    },
    ...overrides,
  };
  return server;
}

const builderFor = (server, extra = {}) =>
  createSorobanTransactionBuilder({
    server,
    networkPassphrase: Networks.TESTNET,
    sleep: async () => {},
    assemble: (tx) => ({ build: () => tx }),
    ...extra,
  });

const params = () => ({
  sourcePublicKey: source.publicKey(),
  contractId: CONTRACT_ID,
  method: 'register',
  args: [],
  signer: source,
});

test('invoke runs build → simulate → assemble → sign → submit once on success', async () => {
  const server = makeServer();
  const result = await builderFor(server).invoke(params());

  assert.equal(result.hash, 'abc123');
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.attempts, 1);
  assert.deepEqual([server.calls.getAccount, server.calls.simulate, server.calls.send], [1, 1, 1]);
});

test('build produces a signed-able contract call for the source account', async () => {
  const tx = await builderFor(makeServer()).build(params());
  assert.equal(tx.source, source.publicKey());
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.operations[0].type, 'invokeHostFunction');
});

test('build rejects missing parameters', async () => {
  await assert.rejects(
    builderFor(makeServer()).build({ sourcePublicKey: source.publicKey() }),
    (err) => err instanceof SorobanTransactionError && err.stage === 'build',
  );
});

test('a simulation error fails fast without retrying or submitting', async () => {
  const server = makeServer({
    async simulateTransaction() {
      server.calls.simulate += 1;
      return { error: 'HostError: contract trapped' };
    },
  });

  await assert.rejects(
    builderFor(server).invoke(params()),
    (err) => err.stage === 'simulate' && err.retryable === false,
  );
  assert.equal(server.calls.simulate, 1);
  assert.equal(server.calls.send, 0);
});

test('retryable submission errors are retried with a fresh build, then succeed', async () => {
  let sends = 0;
  const server = makeServer({
    async sendTransaction() {
      sends += 1;
      server.calls.send += 1;
      return sends < 3
        ? { status: 'TRY_AGAIN_LATER', hash: 'h' }
        : { status: 'PENDING', hash: 'ok' };
    },
  });

  const result = await builderFor(server).invoke(params());
  assert.equal(result.hash, 'ok');
  assert.equal(result.attempts, 3);
  assert.equal(server.calls.getAccount, 3);
});

test('gives up after maxAttempts retryable failures', async () => {
  const server = makeServer({
    async sendTransaction() {
      server.calls.send += 1;
      return { status: 'TRY_AGAIN_LATER', hash: 'h' };
    },
  });

  await assert.rejects(
    builderFor(server, { maxAttempts: 2 }).invoke(params()),
    (err) => err.retryable,
  );
  assert.equal(server.calls.send, 2);
});

test('an on-chain FAILED result is not retried and carries the hash', async () => {
  const server = makeServer({
    async getTransaction() {
      return { status: 'FAILED' };
    },
  });

  await assert.rejects(
    builderFor(server).invoke(params()),
    (err) => err.stage === 'submit' && err.hash === 'abc123' && err.retryable === false,
  );
  assert.equal(server.calls.send, 1);
});

test('polls past NOT_FOUND until the transaction is confirmed', async () => {
  let polls = 0;
  const server = makeServer({
    async getTransaction() {
      polls += 1;
      return polls < 3 ? { status: 'NOT_FOUND' } : { status: 'SUCCESS' };
    },
  });

  const result = await builderFor(server).invoke(params());
  assert.equal(result.status, 'SUCCESS');
  assert.equal(polls, 3);
});

test('sign accepts an async signer function', async () => {
  const tx = await builderFor(makeServer()).build(params());
  let seen = null;
  const signed = await builderFor(makeServer()).sign(tx, async (t) => {
    seen = t;
    return t;
  });
  assert.equal(seen, tx);
  assert.equal(signed, tx);
});
