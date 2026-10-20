// @ts-check
import Redis from 'ioredis';

/**
 * Build a Redis client supporting standalone, Sentinel, and Cluster topologies.
 *
 * Environment variables:
 * - REDIS_URL / REDIS_HOST  — standalone connection string
 * - REDIS_SENTINEL_HOSTS    — comma-separated host:port sentinel endpoints
 * - REDIS_SENTINEL_NAME     — sentinel master name (required with SENTINEL_HOSTS)
 * - REDIS_SENTINEL_PASSWORD — optional sentinel auth password
 * - REDIS_CLUSTER_NODES     — comma-separated host:port cluster seed nodes
 * - REDIS_PASSWORD          — optional Redis auth password (all modes)
 *
 * Sentinel and Cluster modes give automatic failover when a node fails;
 * ioredis reconnects to the promoted primary without application changes.
 *
 * @param {object} [options]
 * @param {string} [options.redisUrl]        Override REDIS_URL
 * @param {string} [options.sentinelHosts]   Override REDIS_SENTINEL_HOSTS
 * @param {string} [options.sentinelName]    Override REDIS_SENTINEL_NAME
 * @param {string} [options.sentinelPassword] Override REDIS_SENTINEL_PASSWORD
 * @param {string} [options.clusterNodes]    Override REDIS_CLUSTER_NODES
 * @param {string} [options.password]        Override REDIS_PASSWORD
 * @param {object} [options.commonOptions]   Extra ioredis options
 * @returns {{ mode: 'sentinel'|'cluster'|'standalone'|'disabled', client: import('ioredis').Redis | import('ioredis').Redis.Cluster | null }}
 */
export function createRedisClient(options = {}) {
  const sentinelHosts = options.sentinelHosts ?? process.env.REDIS_SENTINEL_HOSTS;
  const clusterNodes = options.clusterNodes ?? process.env.REDIS_CLUSTER_NODES;
  const password = options.password ?? process.env.REDIS_PASSWORD;
  const commonOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    ...(password ? { password } : {}),
    ...options.commonOptions,
  };

  if (sentinelHosts) {
    const name = options.sentinelName ?? process.env.REDIS_SENTINEL_NAME;
    if (!name) {
      throw new Error('REDIS_SENTINEL_NAME is required when REDIS_SENTINEL_HOSTS is set');
    }
    const sentinels = parseHostList(sentinelHosts);
    const sentinelPassword =
      options.sentinelPassword ?? process.env.REDIS_SENTINEL_PASSWORD ?? undefined;
    const client = new Redis({
      ...commonOptions,
      sentinels,
      name,
      ...(sentinelPassword ? { sentinelPassword } : {}),
    });
    return { mode: 'sentinel', client };
  }

  if (clusterNodes) {
    const nodes = parseHostList(clusterNodes);
    const client = new Redis.Cluster(nodes, {
      redisOptions: commonOptions,
      clusterRetryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    return { mode: 'cluster', client };
  }

  const redisUrl = options.redisUrl ?? process.env.REDIS_URL ?? process.env.REDIS_HOST;
  if (!redisUrl) {
    return { mode: 'disabled', client: null };
  }

  const client = new Redis(redisUrl, commonOptions);
  return { mode: 'standalone', client };
}

/**
 * Parse a comma-separated "host:port" list into ioredis node descriptors.
 * @param {string} value
 * @returns {{ host: string, port: number }[]}
 */
export function parseHostList(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host, port] = entry.split(':');
      if (!host || !port) {
        throw new Error(`Invalid Redis host entry "${entry}" — expected host:port`);
      }
      return { host, port: Number(port) };
    });
}
