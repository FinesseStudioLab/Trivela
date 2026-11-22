import { log } from './middleware/logger.js';
import { getRequestId } from './lib/requestContext.js';

const HEALTHCHECK_REQUEST = {
  jsonrpc: '2.0',
  id: 'health-check',
  method: 'getNetwork',
};

// Running totals of RPC probe latency, exported to /metrics as a summary.
const latencyStats = { sumMs: 0, count: 0 };

/** @returns {{ sumMs: number, count: number }} */
export function getRpcLatencyStats() {
  return { ...latencyStats };
}

function recordLatency(durationMs) {
  latencyStats.sumMs += durationMs;
  latencyStats.count += 1;
}

/**
 * @param {{ rpcUrl: string, fetchImpl?: typeof fetch }} params
 */
export async function checkSorobanRpcHealth({ rpcUrl, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    return {
      status: 'error',
      url: rpcUrl,
      error: 'Fetch is not available in this runtime.',
    };
  }

  const startedAt = Date.now();
  // Propagate the current correlation ID (#925) so it shows up in the RPC
  // provider's own logs if they honor the header, and in ours below.
  const requestId = getRequestId();

  try {
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      body: JSON.stringify(HEALTHCHECK_REQUEST),
    });

    const payload = await response.json().catch(() => null);
    const durationMs = Date.now() - startedAt;
    recordLatency(durationMs);

    if (!response.ok) {
      const error = payload?.error?.message || `HTTP ${response.status}`;
      log.warn({ url: rpcUrl, httpStatus: response.status, durationMs, error }, 'rpc:error');
      return {
        status: 'error',
        url: rpcUrl,
        httpStatus: response.status,
        error,
      };
    }

    if (payload?.error) {
      const error = payload.error.message || 'Soroban RPC returned an error.';
      log.warn({ url: rpcUrl, durationMs, error }, 'rpc:error');
      return {
        status: 'error',
        url: rpcUrl,
        error,
      };
    }

    log.info({ url: rpcUrl, method: HEALTHCHECK_REQUEST.method, durationMs }, 'rpc:success');
    return {
      status: 'ok',
      url: rpcUrl,
      method: HEALTHCHECK_REQUEST.method,
      result: payload?.result ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Soroban RPC error';
    const durationMs = Date.now() - startedAt;
    recordLatency(durationMs);
    log.warn({ url: rpcUrl, durationMs, error: message }, 'rpc:request_failed');
    return {
      status: 'error',
      url: rpcUrl,
      error: message,
    };
  }
}
