/**
 * `@trivela/core` — lightweight vanilla JS/TS SDK entry point.
 *
 * Zero UI framework dependencies (no React, no DOM assumptions). Suitable
 * for Node services, vanilla browser apps, workers, and edge runtimes.
 */

export {
  createClient,
  TrivelaHttpError,
  type TrivelaClient,
  type TrivelaClientConfig,
  type RequestOptions,
} from './http.js';

export {
  RpcNodeManager,
  RpcCallError,
  createRpcNodeManager,
  type RpcNodeManagerOptions,
  type RpcNodeStatus,
} from './rpc.js';
