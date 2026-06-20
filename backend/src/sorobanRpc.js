const HEALTHCHECK_REQUEST = {
  jsonrpc: '2.0',
  id: 'health-check',
  method: 'getNetwork',
};

export async function checkSorobanRpcHealth({ rpcUrl, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    return {
      status: 'error',
      url: rpcUrl,
      error: 'Fetch is not available in this runtime.',
    };
  }

  try {
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(HEALTHCHECK_REQUEST),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        status: 'error',
        url: rpcUrl,
        httpStatus: response.status,
        error: payload?.error?.message || `HTTP ${response.status}`,
      };
    }

    if (payload?.error) {
      return {
        status: 'error',
        url: rpcUrl,
        error: payload.error.message || 'Soroban RPC returned an error.',
      };
    }

    return {
      status: 'ok',
      url: rpcUrl,
      method: HEALTHCHECK_REQUEST.method,
      result: payload?.result ?? null,
    };
  } catch (error) {
    return {
      status: 'error',
      url: rpcUrl,
      error: error instanceof Error ? error.message : 'Unknown Soroban RPC error',
    };
  }
}
