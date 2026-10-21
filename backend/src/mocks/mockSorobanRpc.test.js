import assert from 'node:assert/strict';
import test from 'node:test';
import { rpc as sdkRpc } from '@stellar/stellar-sdk';
import { checkSorobanRpcHealth } from '../sorobanRpc.js';
import {
  createMockSorobanRpc,
  MOCK_NETWORK_PASSPHRASE,
  startMockSorobanRpcServer,
} from './mockSorobanRpc.js';

const call = (rpc, method, params) => rpc.handle({ jsonrpc: '2.0', id: 1, method, params });

test('default responses are valid JSON-RPC envelopes for the common methods', () => {
  const rpc = createMockSorobanRpc({ latestLedger: 4242 });

  assert.deepEqual(call(rpc, 'getLatestLedger').result.sequence, 4242);
  assert.equal(call(rpc, 'getNetwork').result.passphrase, MOCK_NETWORK_PASSPHRASE);
  assert.equal(call(rpc, 'getHealth').result.status, 'healthy');
  assert.deepEqual(call(rpc, 'getEvents').result.events, []);
  assert.equal(call(rpc, 'getHealth').jsonrpc, '2.0');
  assert.equal(call(rpc, 'getHealth').id, 1);
});

test('unknown methods return a JSON-RPC method-not-found error', () => {
  const res = call(createMockSorobanRpc(), 'noSuchMethod');
  assert.equal(res.error.code, -32601);
  assert.match(res.error.message, /noSuchMethod/);
});

test('setResponse overrides a method with a value or a function of the params', () => {
  const rpc = createMockSorobanRpc();
  rpc.setResponse('getLedgerEntries', { entries: [{ key: 'k' }], latestLedger: 1 });
  assert.equal(call(rpc, 'getLedgerEntries').result.entries[0].key, 'k');

  rpc.setResponse('getEvents', (params) => ({
    events: [],
    latestLedger: 9,
    echoed: params.startLedger,
  }));
  assert.equal(call(rpc, 'getEvents', { startLedger: 77 }).result.echoed, 77);
});

test('failNext injects a bounded number of failures, then recovers', () => {
  const rpc = createMockSorobanRpc();
  rpc.failNext('getHealth', { message: 'boom' }, 2);

  assert.equal(call(rpc, 'getHealth').error.message, 'boom');
  assert.equal(call(rpc, 'getHealth').error.message, 'boom');
  assert.equal(call(rpc, 'getHealth').result.status, 'healthy');
});

test('calls are recorded in order and reset() clears state', () => {
  const rpc = createMockSorobanRpc({ latestLedger: 10 });
  call(rpc, 'getHealth');
  call(rpc, 'getLatestLedger', { a: 1 });
  rpc.advanceLedger(5);

  assert.deepEqual(
    rpc.calls.map((c) => c.method),
    ['getHealth', 'getLatestLedger'],
  );
  assert.equal(rpc.callCount('getHealth'), 1);
  assert.equal(rpc.latestLedger, 15);

  rpc.reset();
  assert.equal(rpc.calls.length, 0);
  assert.equal(rpc.latestLedger, 10);
});

test('sendTransaction yields a unique hash that getTransaction resolves, after pending polls', () => {
  const rpc = createMockSorobanRpc({ pendingPolls: 2 });
  const a = call(rpc, 'sendTransaction', { transaction: 'x' }).result;
  const b = call(rpc, 'sendTransaction', { transaction: 'y' }).result;
  assert.equal(a.status, 'PENDING');
  assert.notEqual(a.hash, b.hash);

  assert.equal(call(rpc, 'getTransaction', { hash: a.hash }).result.status, 'NOT_FOUND');
  assert.equal(call(rpc, 'getTransaction', { hash: a.hash }).result.status, 'NOT_FOUND');
  assert.equal(call(rpc, 'getTransaction', { hash: a.hash }).result.status, 'SUCCESS');
  assert.equal(call(rpc, 'getTransaction', { hash: 'unknown' }).result.status, 'NOT_FOUND');
});

test('registerTransaction can pin a failed outcome', () => {
  const rpc = createMockSorobanRpc();
  rpc.registerTransaction('abc', { status: 'FAILED' });
  assert.equal(call(rpc, 'getTransaction', { hash: 'abc' }).result.status, 'FAILED');
});

test('the fetch adapter works with code that accepts a fetchImpl', async () => {
  const rpc = createMockSorobanRpc();
  const ok = await checkSorobanRpcHealth({ rpcUrl: 'https://rpc.invalid', fetchImpl: rpc.fetch });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.result.passphrase, MOCK_NETWORK_PASSPHRASE);
  assert.equal(rpc.callCount('getNetwork'), 1);

  rpc.failNext('getNetwork', { message: 'node down' });
  const rpcError = await checkSorobanRpcHealth({
    rpcUrl: 'https://rpc.invalid',
    fetchImpl: rpc.fetch,
  });
  assert.equal(rpcError.status, 'error');
  assert.equal(rpcError.error, 'node down');

  rpc.failNext('getNetwork', { httpStatus: 503, message: 'unavailable' });
  const http = await checkSorobanRpcHealth({ rpcUrl: 'https://rpc.invalid', fetchImpl: rpc.fetch });
  assert.equal(http.status, 'error');
  assert.equal(http.httpStatus, 503);
});

test('the HTTP server works with the Stellar SDK RPC client, fully offline', async () => {
  const server = await startMockSorobanRpcServer(createMockSorobanRpc({ latestLedger: 555 }));
  try {
    const client = new sdkRpc.Server(server.url, { allowHttp: true });
    const ledger = await client.getLatestLedger();
    assert.equal(ledger.sequence, 555);
    const health = await client.getHealth();
    assert.equal(health.status, 'healthy');
    assert.deepEqual(
      server.rpc.calls.map((c) => c.method),
      ['getLatestLedger', 'getHealth'],
    );
  } finally {
    await server.close();
  }
});
