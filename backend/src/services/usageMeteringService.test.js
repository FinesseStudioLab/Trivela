// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteUsageRepository } from '../dal/sqliteUsageRepository.js';
import { createUsageMeteringService } from './usageMeteringService.js';

async function makeDb() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return db;
}

async function makeService({ redisClient = null, timeProvider = Date.now } = {}) {
  const db = await makeDb();
  const usageRepository = createSqliteUsageRepository({ db });
  const service = createUsageMeteringService({ usageRepository, redisClient, timeProvider });
  return { service, usageRepository, db };
}

// ── increment (no Redis) ────────────────────────────────────────────────────

test('increment returns count=1 for first call (no Redis)', async () => {
  const { service } = await makeService();
  const result = await service.increment('org-1', 'api_calls');
  assert.equal(result.count, 1);
  assert.equal(result.softLimit, null);
  assert.equal(result.hardLimit, null);
  assert.ok(typeof result.windowStart === 'string');
});

test('increment accumulates across calls within same window', async () => {
  const now = Date.now();
  const { service } = await makeService({ timeProvider: () => now });
  await service.increment('org-1', 'api_calls');
  await service.increment('org-1', 'api_calls');
  const result = await service.increment('org-1', 'api_calls');
  assert.equal(result.count, 3);
});

test('increment tracks different resources independently', async () => {
  const { service } = await makeService();
  await service.increment('org-1', 'api_calls');
  const result = await service.increment('org-1', 'campaigns');
  assert.equal(result.count, 1);
});

test('increment tracks different orgs independently', async () => {
  const { service } = await makeService();
  await service.increment('org-1', 'api_calls');
  const result = await service.increment('org-2', 'api_calls');
  assert.equal(result.count, 1);
});

// ── quota enforcement return values ────────────────────────────────────────

test('increment returns quota limits when quota exists', async () => {
  const { service, usageRepository, db } = await makeService();

  // Create an org and set a quota.
  db.exec(`INSERT INTO orgs (id, name, created_at) VALUES ('org-q', 'Q', '2024-01-01T00:00:00Z')`);
  usageRepository.upsertQuota({
    orgId: 'org-q',
    resource: 'api_calls',
    softLimit: 5,
    hardLimit: 10,
    windowSeconds: 3600,
  });

  const result = await service.increment('org-q', 'api_calls');
  assert.equal(result.softLimit, 5);
  assert.equal(result.hardLimit, 10);
  assert.equal(result.windowSeconds, 3600);
});

// ── window bucketing ───────────────────────────────────────────────────────

test('windows roll over when the period expires', async () => {
  const T0 = Date.now();
  const { service } = await makeService({ timeProvider: () => T0 });
  await service.increment('org-1', 'api_calls');

  // Advance past the 1-hour window.
  const T1 = T0 + 3601 * 1000;
  const { service: service2 } = await makeService({ timeProvider: () => T1 });
  const result = await service2.increment('org-1', 'api_calls');
  assert.equal(result.count, 1, 'counter should reset in a new window');
});

// ── getOrgUsage ────────────────────────────────────────────────────────────

test('getOrgUsage returns empty array when no usage recorded', async () => {
  const { service } = await makeService();
  assert.deepEqual(service.getOrgUsage('unknown-org'), []);
});

test('getOrgUsage returns latest window per resource', async () => {
  const { service } = await makeService();
  await service.increment('org-1', 'api_calls');
  await service.increment('org-1', 'api_calls');
  await service.increment('org-1', 'campaigns');

  const usage = service.getOrgUsage('org-1');
  const apiCalls = usage.find((u) => u.resource === 'api_calls');
  const campaigns = usage.find((u) => u.resource === 'campaigns');

  assert.ok(apiCalls);
  assert.equal(apiCalls.count, 2);
  assert.ok(campaigns);
  assert.equal(campaigns.count, 1);
});

// ── adminExport ────────────────────────────────────────────────────────────

test('adminExport returns rows from all orgs', async () => {
  const { service } = await makeService();
  await service.increment('org-a', 'api_calls');
  await service.increment('org-b', 'api_calls');

  const rows = service.adminExport();
  const orgIds = rows.map((r) => r.orgId);
  assert.ok(orgIds.includes('org-a'));
  assert.ok(orgIds.includes('org-b'));
});

// ── flushToDb (no Redis) ───────────────────────────────────────────────────

test('flushToDb is a no-op when Redis is not configured', async () => {
  const { service } = await makeService();
  await assert.doesNotReject(() => service.flushToDb());
});

// ── Redis mock path ────────────────────────────────────────────────────────

test('increment uses Redis when client is provided', async () => {
  const store = new Map();
  const ttls = new Map();

  const mockRedis = {
    multi() {
      const ops = [];
      const chain = {
        incr(key) {
          ops.push({ op: 'incr', key });
          return chain;
        },
        pttl(key) {
          ops.push({ op: 'pttl', key });
          return chain;
        },
        incr2(key) {
          ops.push({ op: 'incr', key });
          return chain;
        },
        async exec() {
          const results = [];
          for (const { op, key } of ops) {
            if (op === 'incr') {
              const val = (store.get(key) ?? 0) + 1;
              store.set(key, val);
              results.push([null, val]);
            } else if (op === 'pttl') {
              results.push([null, ttls.get(key) ?? -2]);
            }
          }
          return results;
        },
      };
      return chain;
    },
    async pexpire(key, ms) {
      ttls.set(key, ms);
    },
    async keys(pattern) {
      const prefix = pattern.replace('*', '');
      return [...store.keys()].filter((k) => k.startsWith(prefix) && !k.endsWith(':lifetime'));
    },
    async get(key) {
      return String(store.get(key) ?? '0');
    },
  };

  const db = await makeDb();
  db.exec(`INSERT INTO orgs (id, name, created_at) VALUES ('org-r', 'R', '2024-01-01T00:00:00Z')`);
  const usageRepository = createSqliteUsageRepository({ db });
  const service = createUsageMeteringService({
    usageRepository,
    redisClient: /** @type {any} */ (mockRedis),
  });

  const r1 = await service.increment('org-r', 'api_calls');
  assert.equal(r1.count, 1);

  const r2 = await service.increment('org-r', 'api_calls');
  assert.equal(r2.count, 2);
});
