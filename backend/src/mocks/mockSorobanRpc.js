// @ts-check
import { createServer } from 'node:http';

/**
 * Offline Soroban RPC fixture (#1325).
 *
 * A deterministic, in-memory stand-in for a Soroban JSON-RPC endpoint so unit
 * tests never touch the network. Use it three ways:
 *
 *   - `rpc.handle(body)`  call the JSON-RPC handler directly.
 *   - `rpc.fetch`         drop-in `fetch` for code that takes `fetchImpl`
 *                         (e.g. `checkSorobanRpcHealth`).
 *   - `startMockSorobanRpcServer()`  a real local HTTP server for clients that
 *                         need a URL (e.g. `@stellar/stellar-sdk`'s `rpc.Server`).
 *
 * Defaults are valid-shaped responses for the common methods; override any of
 * them per test with `setResponse`, inject failures with `failNext`, and
 * inspect traffic through `calls`.
 */

export const MOCK_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

/**
 * @typedef {{ jsonrpc: '2.0', id: unknown, method: string, params?: any }} JsonRpcRequest
 * @typedef {{ method: string, params: any }} RecordedCall
 * @typedef {any | ((params: any, rpc: ReturnType<typeof createMockSorobanRpc>) => any)} ResponseSpec
 * @typedef {{ code?: number, message?: string, httpStatus?: number }} FailureSpec
 */

/**
 * @param {{ latestLedger?: number, networkPassphrase?: string, pendingPolls?: number }} [options]
 *   `pendingPolls` is how many `getTransaction` calls report NOT_FOUND before a
 *   submitted transaction resolves (default 0 = resolves immediately).
 */
export function createMockSorobanRpc({
  latestLedger = 1_000,
  networkPassphrase = MOCK_NETWORK_PASSPHRASE,
  pendingPolls = 0,
} = {}) {
  let ledger = latestLedger;
  let submitted = 0;
  /** @type {RecordedCall[]} */
  const calls = [];
  /** @type {Map<string, ResponseSpec>} */
  const overrides = new Map();
  /** @type {Map<string, FailureSpec[]>} */
  const failures = new Map();
  /** @type {Map<string, { polls: number, notFoundPolls: number, result: any }>} */
  const transactions = new Map();

  /** @type {Record<string, (params: any) => any>} */
  const defaults = {
    getHealth: () => ({
      status: 'healthy',
      latestLedger: ledger,
      oldestLedger: Math.max(1, ledger - 17_280),
      ledgerRetentionWindow: 17_280,
    }),
    getNetwork: () => ({
      friendbotUrl: 'https://friendbot.stellar.org',
      passphrase: networkPassphrase,
      protocolVersion: 22,
    }),
    getLatestLedger: () => ({
      id: `mock-ledger-${ledger}`,
      protocolVersion: 22,
      sequence: ledger,
    }),
    getLedgerEntries: () => ({ entries: [], latestLedger: ledger }),
    getEvents: () => ({ events: [], latestLedger: ledger, cursor: String(ledger) }),
    simulateTransaction: () => ({
      latestLedger: ledger,
      minResourceFee: '100',
      cost: { cpuInsns: '0', memBytes: '0' },
      results: [],
    }),
    sendTransaction: () => {
      submitted += 1;
      const hash = submitted.toString(16).padStart(64, '0');
      transactions.set(hash, {
        polls: 0,
        notFoundPolls: pendingPolls,
        result: { status: 'SUCCESS', latestLedger: ledger, ledger, applicationOrder: 1 },
      });
      return { status: 'PENDING', hash, latestLedger: ledger, latestLedgerCloseTime: '0' };
    },
    getTransaction: (params) => {
      const hash = params?.hash;
      const tx = hash ? transactions.get(hash) : undefined;
      if (!tx) return { status: 'NOT_FOUND', latestLedger: ledger };
      tx.polls += 1;
      if (tx.polls <= tx.notFoundPolls) return { status: 'NOT_FOUND', latestLedger: ledger };
      return { ...tx.result, latestLedger: ledger };
    },
  };

  /**
   * @param {JsonRpcRequest} request
   * @returns {{ httpStatus: number, body: any }}
   */
  function dispatch(request) {
    const { id = null, method, params } = request ?? {};
    calls.push({ method, params });

    const queued = failures.get(method);
    if (queued?.length) {
      const failure = /** @type {FailureSpec} */ (queued.shift());
      if (failure.httpStatus && failure.httpStatus >= 400) {
        return {
          httpStatus: failure.httpStatus,
          body: {
            jsonrpc: '2.0',
            id,
            error: { code: failure.code ?? -32603, message: failure.message ?? 'Internal error' },
          },
        };
      }
      return {
        httpStatus: 200,
        body: {
          jsonrpc: '2.0',
          id,
          error: { code: failure.code ?? -32603, message: failure.message ?? 'Internal error' },
        },
      };
    }

    const override = overrides.get(method);
    const produce = override !== undefined ? override : defaults[method];
    if (produce === undefined) {
      return {
        httpStatus: 200,
        body: {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        },
      };
    }
    const result = typeof produce === 'function' ? produce(params, api) : produce;
    return { httpStatus: 200, body: { jsonrpc: '2.0', id, result } };
  }

  const api = {
    /** Every request received, in order. */
    calls,

    /** Number of calls received for `method`. */
    callCount: (/** @type {string} */ method) => calls.filter((c) => c.method === method).length,

    /** Replace the response for `method` with a value or `(params, rpc) => value`. */
    setResponse(/** @type {string} */ method, /** @type {ResponseSpec} */ spec) {
      overrides.set(method, spec);
      return api;
    },

    /**
     * Make the next `times` calls to `method` fail. By default this is a
     * JSON-RPC error (HTTP 200); pass `httpStatus` (e.g. 503) for a transport failure.
     */
    failNext(/** @type {string} */ method, /** @type {FailureSpec} */ failure = {}, times = 1) {
      const queue = failures.get(method) ?? [];
      for (let i = 0; i < times; i += 1) queue.push(failure);
      failures.set(method, queue);
      return api;
    },

    /** Pre-register the outcome of a transaction hash for `getTransaction`. */
    registerTransaction(/** @type {string} */ hash, /** @type {any} */ result, notFoundPolls = 0) {
      transactions.set(hash, { polls: 0, notFoundPolls, result });
      return api;
    },

    /** Move the chain forward. */
    advanceLedger(n = 1) {
      ledger += n;
      return ledger;
    },

    get latestLedger() {
      return ledger;
    },

    /** Forget overrides, queued failures, recorded calls and submitted transactions. */
    reset() {
      calls.length = 0;
      overrides.clear();
      failures.clear();
      transactions.clear();
      submitted = 0;
      ledger = latestLedger;
    },

    /** Handle one JSON-RPC request object and return the JSON-RPC response envelope. */
    handle(/** @type {JsonRpcRequest} */ request) {
      return dispatch(request).body;
    },

    /** `fetch`-compatible adapter: POST a JSON-RPC body, get a real `Response`. */
    fetch: async (/** @type {any} */ _url, /** @type {any} */ init = {}) => {
      /** @type {JsonRpcRequest} */
      let request;
      try {
        request = JSON.parse(String(init.body ?? '{}'));
      } catch {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      const { httpStatus, body } = dispatch(request);
      return new Response(JSON.stringify(body), {
        status: httpStatus,
        headers: { 'content-type': 'application/json' },
      });
    },
  };

  return api;
}

/**
 * Serve a mock RPC over a local HTTP port (ephemeral by default).
 * @param {ReturnType<typeof createMockSorobanRpc>} [rpc]
 * @returns {Promise<{ url: string, rpc: ReturnType<typeof createMockSorobanRpc>, close: () => Promise<void> }>}
 */
export async function startMockSorobanRpcServer(rpc = createMockSorobanRpc()) {
  const server = createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let request;
      try {
        request = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }),
        );
        return;
      }
      const response = rpc.fetch('', { body: JSON.stringify(request) });
      response.then(async (r) => {
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(await r.text());
      });
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

  return {
    url: `http://127.0.0.1:${port}`,
    rpc,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections?.();
        server.close((err) => (err ? reject(err) : resolve(undefined)));
      }),
  };
}
