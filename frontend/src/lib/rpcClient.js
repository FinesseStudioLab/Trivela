// src/lib/rpcClient.js

let failureCount = 0;
const FAILURE_THRESHOLD = 5;

export async function rpcRequest(fn, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;
  const retries = options.retries || 2;

  // simple circuit breaker
  if (failureCount >= FAILURE_THRESHOLD) {
    throw new Error('RPC temporarily unavailable (circuit open)');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), timeoutMs)),
      ]);

      // reset on success
      failureCount = 0;

      return result;
    } catch (err) {
      failureCount++;

      if (attempt === retries) {
        throw err;
      }

      // backoff: 500ms, 1000ms, etc.
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}
