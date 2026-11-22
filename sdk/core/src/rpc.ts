/**
 * Auto-reconnect fallback RPC node manager for Soroban JSON-RPC.
 *
 * Tries the primary node first; on HTTP 5xx or a transport failure it marks
 * that node unhealthy and fails over to the next configured node. Unhealthy
 * nodes are probed again after a backoff window so a recovered primary is
 * automatically reconnected to.
 */

export interface RpcNodeManagerOptions {
  /** Milliseconds before an unhealthy node is retried. Default 30_000. */
  reconnectAfterMs?: number;
  /** Maximum retries across all nodes per call. Default = number of nodes. */
  maxAttempts?: number;
  /** Custom fetch implementation (useful for tests). */
  fetchImpl?: typeof fetch;
  /** Extra headers sent with every JSON-RPC request. */
  headers?: Record<string, string>;
}

export interface RpcNodeStatus {
  url: string;
  healthy: boolean;
  lastError: string | null;
}

interface NodeState {
  url: string;
  healthy: boolean;
  unhealthySince: number | null;
  lastError: string | null;
}

export class RpcCallError extends Error {
  readonly code: string | undefined;
  readonly url: string | undefined;

  constructor(message: string, code?: string, url?: string) {
    super(message);
    this.name = 'RpcCallError';
    this.code = code;
    this.url = url;
  }
}

export class RpcNodeManager {
  private readonly nodes: NodeState[];
  private readonly reconnectAfterMs: number;
  private readonly maxAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;
  private nextIndex = 0;

  constructor(urls: string[], options: RpcNodeManagerOptions = {}) {
    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error('RpcNodeManager requires at least one RPC URL');
    }
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch is not available in this runtime; pass options.fetchImpl');
    }

    this.nodes = urls.map((url) => ({
      url,
      healthy: true,
      unhealthySince: null,
      lastError: null,
    }));
    this.reconnectAfterMs = options.reconnectAfterMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? urls.length;
    this.fetchImpl = fetchImpl;
    this.headers = options.headers ?? {};
  }

  /** URLs in configured order. */
  getUrls(): string[] {
    return this.nodes.map((n) => n.url);
  }

  /** The URL that will be tried first for the next call. */
  getActiveUrl(): string {
    this.recoverStale();
    return this.firstHealthy()?.url ?? this.nodes[this.nextIndex % this.nodes.length].url;
  }

  /** Snapshot of node health for diagnostics. */
  getStatus(): RpcNodeStatus[] {
    this.recoverStale();
    return this.nodes.map(({ url, healthy, lastError }) => ({ url, healthy, lastError }));
  }

  /** Mark a node healthy again (e.g. after an external health check passes). */
  markHealthy(url: string): void {
    const node = this.nodes.find((n) => n.url === url);
    if (node) {
      node.healthy = true;
      node.unhealthySince = null;
      node.lastError = null;
    }
  }

  /**
   * Issue a JSON-RPC call against the preferred node, failing over to
   * fallback nodes when the primary returns 5xx or the transport fails.
   *
   * JSON-RPC-level errors (non-2xx is transport; `error` in the 200 body
   * is application-level) are returned to the caller without failover —
   * only node/transport failures trigger the fallback path.
   */
  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.recoverStale();

    const attempts = Math.max(1, this.maxAttempts);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const node = this.nextHealthy();
      if (!node) break;

      try {
        const payload = await this.postRpc(node.url, method, params);
        node.healthy = true;
        node.unhealthySince = null;
        node.lastError = null;
        return payload as T;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;

        // Only transport / 5xx failures mark the node unhealthy.
        if (error instanceof RpcCallError && error.code === 'RPC_ERROR') {
          throw error;
        }
        this.markUnhealthy(node, error.message);
      }
    }

    throw lastError ?? new RpcCallError('No healthy RPC nodes available');
  }

  private async postRpc(url: string, method: string, params?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...this.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          ...(params !== undefined ? { params } : {}),
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new RpcCallError(`RPC transport error: ${message}`, 'TRANSPORT_ERROR', url);
    }

    if (response.status >= 500) {
      throw new RpcCallError(`RPC node returned HTTP ${response.status}`, 'HTTP_5XX', url);
    }
    if (!response.ok) {
      // 4xx is a client/request problem, not a node problem — surface without failover.
      throw new RpcCallError(`RPC node returned HTTP ${response.status}`, 'RPC_ERROR', url);
    }

    const body = (await response.json().catch(() => null)) as {
      result?: unknown;
      error?: { code?: number; message?: string };
    } | null;

    if (body && typeof body === 'object' && 'error' in body && body.error) {
      throw new RpcCallError(
        body.error.message || 'Soroban RPC returned an error',
        'RPC_ERROR',
        url,
      );
    }

    return body && typeof body === 'object' && 'result' in body ? body.result : body;
  }

  private recoverStale(): void {
    const now = Date.now();
    for (const node of this.nodes) {
      if (!node.healthy && node.unhealthySince !== null && now - node.unhealthySince >= this.reconnectAfterMs) {
        node.healthy = true;
        node.unhealthySince = null;
      }
    }
  }

  private firstHealthy(): NodeState | undefined {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[(this.nextIndex + i) % this.nodes.length];
      if (node.healthy) return node;
    }
    return undefined;
  }

  private nextHealthy(): NodeState | undefined {
    const node = this.firstHealthy();
    if (node) {
      this.nextIndex = (this.nodes.indexOf(node) + 1) % this.nodes.length;
    }
    return node;
  }

  private markUnhealthy(node: NodeState, message: string): void {
    node.healthy = false;
    node.unhealthySince = Date.now();
    node.lastError = message;
  }
}

/**
 * Convenience factory matching the `create*` style used across the codebase.
 */
export function createRpcNodeManager(
  urls: string[],
  options?: RpcNodeManagerOptions,
): RpcNodeManager {
  return new RpcNodeManager(urls, options);
}
