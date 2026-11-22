import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RpcCallError, RpcNodeManager, createRpcNodeManager } from '../src/rpc.ts';

function okFetch(result: unknown) {
  return async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

function fetchSequence(responses: Array<() => Promise<Response>>) {
  let i = 0;
  return async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return next();
  };
}

function http500() {
  return async () => new Response('boom', { status: 500 });
}

function rpcErrorResponse() {
  return async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'bad req' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

test('constructing with no URLs throws', () => {
  assert.throws(() => new RpcNodeManager([]), /at least one RPC URL/);
});

test('call returns result from the primary node', async () => {
  const mgr = createRpcNodeManager(['https://primary.example'], {
    fetchImpl: okFetch({ network: 'testnet' }) as typeof fetch,
  });
  const result = await mgr.call<{ network: string }>('getNetwork');
  assert.deepEqual(result, { network: 'testnet' });
  assert.equal(mgr.getActiveUrl(), 'https://primary.example');
});

test('fails over to secondary when primary returns 5xx', async () => {
  const mgr = createRpcNodeManager(['https://primary.example', 'https://secondary.example'], {
    fetchImpl: fetchSequence([http500(), okFetch({ ok: true })]) as typeof fetch,
  });
  const result = await mgr.call<{ ok: boolean }>('getNetwork');
  assert.deepEqual(result, { ok: true });

  const status = mgr.getStatus();
  assert.equal(status[0].healthy, false);
  assert.equal(status[1].healthy, true);
});

test('fails over on transport errors', async () => {
  const mgr = createRpcNodeManager(['https://primary.example', 'https://secondary.example'], {
    fetchImpl: fetchSequence([
      async () => {
        throw new Error('ECONNREFUSED');
      },
      okFetch('pong'),
    ]) as typeof fetch,
  });
  const result = await rpcNodeResult(mgr);
  assert.equal(result, 'pong');
});

test('JSON-RPC application errors do not fail over', async () => {
  const mgr = createRpcNodeManager(['https://primary.example', 'https://secondary.example'], {
    fetchImpl: fetchSequence([rpcErrorResponse(), okFetch('unused')]) as typeof fetch,
  });
  await assert.rejects(() => mgr.call('getNetwork'), (err: unknown) => {
    assert.ok(err instanceof RpcCallError);
    assert.equal(err.code, 'RPC_ERROR');
    return true;
  });
});

test('unhealthy node is retried after reconnect window', async () => {
  let calls = 0;
  const mgr = new RpcNodeManager(['https://primary.example', 'https://secondary.example'], {
    reconnectAfterMs: 10,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) return new Response('down', { status: 503 });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
  });

  // First call: primary fails, secondary serves.
  assert.equal(await mgr.call('getNetwork'), 'ok');
  assert.equal(mgr.getStatus()[0].healthy, false);

  // After the reconnect window the primary is probed again and recovers.
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(mgr.getStatus()[0].healthy, true);
  assert.equal(mgr.getActiveUrl(), 'https://primary.example');
});

test('throws when every node is exhausted', async () => {
  const mgr = createRpcNodeManager(['https://a.example', 'https://b.example'], {
    fetchImpl: (async () => new Response('down', { status: 502 })) as typeof fetch,
  });
  await assert.rejects(() => mgr.call('getNetwork'), /HTTP 502/);
  assert.equal(mgr.getStatus().every((n) => !n.healthy), true);
});

test('markHealthy restores a node manually', async () => {
  const mgr = createRpcNodeManager(['https://a.example'], {
    fetchImpl: (async () => new Response('down', { status: 500 })) as typeof fetch,
  });
  await assert.rejects(() => mgr.call('getNetwork'));
  assert.equal(mgr.getStatus()[0].healthy, false);
  mgr.markHealthy('https://a.example');
  assert.equal(mgr.getStatus()[0].healthy, true);
});

async function rpcNodeResult(mgr: RpcNodeManager): Promise<unknown> {
  return mgr.call('getHealth');
}
