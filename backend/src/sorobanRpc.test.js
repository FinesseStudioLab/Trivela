// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSorobanRpcHealth } from './sorobanRpc.js';
import { log } from './middleware/logger.js';
import { runWithRequestId } from './lib/requestContext.js';

async function withCapturedLog(level, fn) {
  const captured = [];
  const original = log[level].bind(log);
  log[level] = (payload, msg) => {
    captured.push({ payload, msg });
  };
  try {
    const result = await fn();
    return { result, captured };
  } finally {
    log[level] = original;
  }
}

test('returns status ok on a successful health check', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 'health-check', result: { foo: 'bar' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const result = await checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl });

  assert.equal(result.status, 'ok');
  assert.equal(result.url, 'https://rpc.example');
  assert.equal(result.method, 'getNetwork');
  assert.deepEqual(result.result, { foo: 'bar' });
});

test('returns status error on a non-ok HTTP response', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: 'boom' } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });

  const result = await checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl });

  assert.equal(result.status, 'error');
  assert.equal(result.httpStatus, 500);
  assert.equal(result.error, 'boom');
});

test('returns status error when the RPC payload itself reports an error', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', error: { message: 'bad request' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const result = await checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl });

  assert.equal(result.status, 'error');
  assert.equal(result.error, 'bad request');
});

test('returns status error when fetch itself throws (network failure)', async () => {
  const fetchImpl = async () => {
    throw new Error('connection refused');
  };

  const result = await checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl });

  assert.equal(result.status, 'error');
  assert.equal(result.error, 'connection refused');
});

test('returns status error when fetch is unavailable in the runtime', async () => {
  // null (not undefined) — a default parameter only kicks in for undefined,
  // so this is the only way to reach the "no fetch" branch without falling
  // through to a real globalThis.fetch call.
  const result = await checkSorobanRpcHealth({
    rpcUrl: 'https://rpc.example',
    fetchImpl: /** @type {any} */ (null),
  });

  assert.equal(result.status, 'error');
  assert.match(result.error, /Fetch is not available/);
});

// ── Correlation ID propagation to RPC (#925) ────────────────────────────────

test('propagates the current requestId as an x-request-id header on the outbound call', async () => {
  let observedHeaders;
  const fetchImpl = async (_url, init) => {
    observedHeaders = init.headers;
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await runWithRequestId('req-rpc-test', () =>
    checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl }),
  );

  assert.ok(observedHeaders, 'fetchImpl should have been called');
  assert.equal(observedHeaders['x-request-id'], 'req-rpc-test');
});

test('omits the x-request-id header when called outside any tracked context', async () => {
  let observedHeaders;
  const fetchImpl = async (_url, init) => {
    observedHeaders = init.headers;
    return new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl });

  assert.ok(observedHeaders, 'fetchImpl should have been called');
  assert.equal('x-request-id' in observedHeaders, false);
});

// ── Structured logging (#925) ───────────────────────────────────────────────

test('logs a structured rpc:success line on success', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', result: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  const { captured } = await withCapturedLog('info', () =>
    checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl }),
  );

  assert.equal(captured.length, 1);
  assert.equal(captured[0].msg, 'rpc:success');
  assert.equal(captured[0].payload.url, 'https://rpc.example');
  assert.equal(typeof captured[0].payload.durationMs, 'number');
});

test('logs a structured rpc:error line when the RPC returns an error', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: 'boom' } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });

  const { captured } = await withCapturedLog('warn', () =>
    checkSorobanRpcHealth({ rpcUrl: 'https://rpc.example', fetchImpl }),
  );

  assert.equal(captured.length, 1);
  assert.equal(captured[0].msg, 'rpc:error');
  assert.equal(captured[0].payload.httpStatus, 500);
});
