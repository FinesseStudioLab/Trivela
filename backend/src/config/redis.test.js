import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedisClient, parseHostList } from './redis.js';

test('parseHostList: parses comma-separated host:port entries', () => {
  const nodes = parseHostList('a.example:26379, b.example:26380');
  assert.deepEqual(nodes, [
    { host: 'a.example', port: 26379 },
    { host: 'b.example', port: 26380 },
  ]);
});

test('parseHostList: rejects entries missing host or port', () => {
  assert.throws(() => parseHostList('nocolon'), /Invalid Redis host entry/);
  assert.throws(() => parseHostList(':6379'), /Invalid Redis host entry/);
});

test('createRedisClient: returns disabled when no config is present', () => {
  const saved = {
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_SENTINEL_HOSTS: process.env.REDIS_SENTINEL_HOSTS,
    REDIS_CLUSTER_NODES: process.env.REDIS_CLUSTER_NODES,
  };
  delete process.env.REDIS_URL;
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_SENTINEL_HOSTS;
  delete process.env.REDIS_CLUSTER_NODES;
  try {
    const result = createRedisClient();
    assert.equal(result.client, null);
    assert.equal(result.mode, 'disabled');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('createRedisClient: throws when sentinel hosts are set without a master name', () => {
  assert.throws(
    () =>
      createRedisClient({
        sentinelHosts: 's1:26379',
        sentinelName: undefined,
      }),
    /REDIS_SENTINEL_NAME is required/,
  );
});

test('createRedisClient: builds a Sentinel client when hosts and name are provided', () => {
  const { mode, client } = createRedisClient({
    sentinelHosts: 's1:26379,s2:26379',
    sentinelName: 'trivela-master',
  });
  assert.equal(mode, 'sentinel');
  assert.ok(client, 'client must be created');
  assert.equal(typeof client.connect, 'function');
  client.disconnect();
});

test('createRedisClient: builds a Cluster client when cluster nodes are provided', () => {
  const { mode, client } = createRedisClient({
    clusterNodes: 'c1:6379,c2:6379',
  });
  assert.equal(mode, 'cluster');
  assert.ok(client, 'client must be created');
  assert.equal(typeof client.connect, 'function');
  client.disconnect();
});

test('createRedisClient: builds a standalone client for a URL', () => {
  const { mode, client } = createRedisClient({
    redisUrl: 'redis://localhost:6379',
  });
  assert.equal(mode, 'standalone');
  assert.ok(client, 'client must be created');
  client.disconnect();
});
