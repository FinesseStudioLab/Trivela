// @ts-check
//
// Integration tests for tenant-aware quotas and usage metering (Issue #574).
//
// Covers:
//   GET /api/v1/usage  — requires org-linked key; env-sourced key → 403
//   GET /api/v1/admin/usage  — requires master key
//   PUT /api/v1/admin/usage/quotas  — set soft/hard limits
//   Hard quota enforcement — campaign creation blocked at hard limit
//   Soft quota warning  — X-Quota-Warning header appears at soft limit
//   Multi-tenant isolation — org-A's counter doesn't affect org-B

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../index.js';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteApiKeyRepository } from '../dal/sqliteApiKeyRepository.js';
import { createSqliteOrgMemberRepository } from '../dal/sqliteOrgMemberRepository.js';
import { createSqliteUsageRepository } from '../dal/sqliteUsageRepository.js';

// ── Helpers ────────────────────────────────────────────────────────────────

async function startTestServer(options = {}) {
  const app = await createApp(options);
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = /** @type {any} */ (server.address());
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopTestServer(server) {
  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve(undefined))),
  );
}

async function makeInMemoryDb() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return db;
}

/**
 * Build a db with one org + one API key already created.
 * Returns { db, rawKey, orgId, apiKeyId }.
 */
async function bootstrapOrgAndKey() {
  const db = await makeInMemoryDb();
  const apiKeyRepo = createSqliteApiKeyRepository({ db });
  const orgRepo = createSqliteOrgMemberRepository({ db });

  const { rawKey, key: apiKey } = apiKeyRepo.create({ label: 'test-key' });
  const org = orgRepo.createOrg({ name: 'Test Org' });
  orgRepo.addMember({ orgId: org.id, apiKeyId: apiKey.id, role: 'owner' });

  return { db, rawKey, orgId: org.id, apiKeyId: apiKey.id };
}

// ── GET /api/v1/usage ──────────────────────────────────────────────────────

test('GET /api/v1/usage returns 403 for env-sourced key (no org context)', async () => {
  const { server, baseUrl } = await startTestServer({
    apiKeys: ['test-env-key'],
    disableRedis: true,
  });
  try {
    const res = await fetch(`${baseUrl}/api/v1/usage`, {
      headers: { 'x-api-key': 'test-env-key' },
    });
    assert.equal(res.status, 403);
    const body = /** @type {any} */ (await res.json());
    assert.equal(body.code, 'NO_ORG_CONTEXT');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/usage returns usage for org-linked API key', async () => {
  const { db, rawKey, orgId } = await bootstrapOrgAndKey();
  const { server, baseUrl } = await startTestServer({
    dbPath: ':memory:',
    disableRedis: true,
    apiKeyRepository: createSqliteApiKeyRepository({ db }),
    orgMemberRepository: createSqliteOrgMemberRepository({ db }),
  });
  // Hit a write route first to generate some usage.
  await fetch(`${baseUrl}/api/v1/campaigns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': rawKey },
    body: JSON.stringify({ name: 'C1', description: 'D', rewardPerAction: 1 }),
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/usage`, {
      headers: { 'x-api-key': rawKey },
    });
    assert.equal(res.status, 200);
    const body = /** @type {any} */ (await res.json());
    assert.equal(body.orgId, orgId);
    assert.ok(Array.isArray(body.usage));
  } finally {
    await stopTestServer(server);
  }
});

// ── GET /api/v1/admin/usage ────────────────────────────────────────────────

test('GET /api/v1/admin/usage requires master key and returns usage array', async () => {
  const { server, baseUrl } = await startTestServer({
    masterKey: 'master-key-123',
    disableRedis: true,
  });
  try {
    const unauth = await fetch(`${baseUrl}/api/v1/admin/usage`);
    assert.equal(unauth.status, 401, 'should require master key');

    const res = await fetch(`${baseUrl}/api/v1/admin/usage`, {
      headers: { 'x-api-key': 'master-key-123' },
    });
    assert.equal(res.status, 200);
    const body = /** @type {any} */ (await res.json());
    assert.ok(Array.isArray(body.usage));
  } finally {
    await stopTestServer(server);
  }
});

// ── PUT /api/v1/admin/usage/quotas ────────────────────────────────────────

test('PUT /api/v1/admin/usage/quotas sets quota and returns it', async () => {
  const { db, orgId } = await bootstrapOrgAndKey();
  const { server, baseUrl } = await startTestServer({
    masterKey: 'master-key',
    dbPath: ':memory:',
    disableRedis: true,
    apiKeyRepository: createSqliteApiKeyRepository({ db }),
    orgMemberRepository: createSqliteOrgMemberRepository({ db }),
    usageRepository: createSqliteUsageRepository({ db }),
  });
  try {
    const res = await fetch(`${baseUrl}/api/v1/admin/usage/quotas`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-api-key': 'master-key' },
      body: JSON.stringify({ orgId, resource: 'api_calls', softLimit: 50, hardLimit: 100 }),
    });
    assert.equal(res.status, 200);
    const quota = /** @type {any} */ (await res.json());
    assert.equal(quota.orgId, orgId);
    assert.equal(quota.softLimit, 50);
    assert.equal(quota.hardLimit, 100);
  } finally {
    await stopTestServer(server);
  }
});

// ── Hard limit enforcement ─────────────────────────────────────────────────

test('campaign creation is blocked with 429 when hard api_calls quota is exceeded', async () => {
  const { db, rawKey, orgId } = await bootstrapOrgAndKey();
  const usageRepo = createSqliteUsageRepository({ db });

  // Set a hard limit of 2 api_calls.
  db.exec(
    `INSERT INTO orgs (id, name, created_at) VALUES ('${orgId}', 'x', '2024-01-01') ON CONFLICT DO NOTHING`,
  );
  usageRepo.upsertQuota({ orgId, resource: 'api_calls', hardLimit: 2, windowSeconds: 3600 });

  // Pre-fill counter to 2 (at limit).
  const ws = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
  usageRepo.upsertUsageWindow({ orgId, resource: 'api_calls', windowStart: ws, count: 2 });

  const { server, baseUrl } = await startTestServer({
    dbPath: ':memory:',
    disableRedis: true,
    apiKeyRepository: createSqliteApiKeyRepository({ db }),
    orgMemberRepository: createSqliteOrgMemberRepository({ db }),
    usageRepository: usageRepo,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': rawKey },
      body: JSON.stringify({ name: 'Blocked', description: 'D', rewardPerAction: 1 }),
    });
    assert.equal(res.status, 429);
    const body = /** @type {any} */ (await res.json());
    assert.equal(body.code, 'QUOTA_EXCEEDED');
  } finally {
    await stopTestServer(server);
  }
});

// ── Soft limit warning ─────────────────────────────────────────────────────

test('X-Quota-Warning header present when at soft limit', async () => {
  const { db, rawKey, orgId } = await bootstrapOrgAndKey();
  const usageRepo = createSqliteUsageRepository({ db });

  db.exec(
    `INSERT INTO orgs (id, name, created_at) VALUES ('${orgId}', 'x', '2024-01-01') ON CONFLICT DO NOTHING`,
  );
  usageRepo.upsertQuota({
    orgId,
    resource: 'api_calls',
    softLimit: 1,
    hardLimit: 100,
    windowSeconds: 3600,
  });

  const { server, baseUrl } = await startTestServer({
    dbPath: ':memory:',
    disableRedis: true,
    apiKeyRepository: createSqliteApiKeyRepository({ db }),
    orgMemberRepository: createSqliteOrgMemberRepository({ db }),
    usageRepository: usageRepo,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': rawKey },
      body: JSON.stringify({ name: 'Soft', description: 'D', rewardPerAction: 1 }),
    });
    // The first call increments to 1, which equals softLimit=1 → warning.
    assert.ok(res.headers.get('x-quota-warning'), 'expected X-Quota-Warning header');
  } finally {
    await stopTestServer(server);
  }
});

// ── Multi-tenant isolation ─────────────────────────────────────────────────

test('usage counters are isolated between orgs', async () => {
  const dbA = await makeInMemoryDb();
  const apiKeyRepoA = createSqliteApiKeyRepository({ db: dbA });
  const orgRepoA = createSqliteOrgMemberRepository({ db: dbA });
  const { rawKey: keyA, key: akA } = apiKeyRepoA.create({ label: 'a' });
  const orgA = orgRepoA.createOrg({ name: 'A' });
  orgRepoA.addMember({ orgId: orgA.id, apiKeyId: akA.id, role: 'owner' });

  const { rawKey: keyB, key: akB } = apiKeyRepoA.create({ label: 'b' });
  const orgB = orgRepoA.createOrg({ name: 'B' });
  orgRepoA.addMember({ orgId: orgB.id, apiKeyId: akB.id, role: 'owner' });

  const { server, baseUrl } = await startTestServer({
    dbPath: ':memory:',
    disableRedis: true,
    apiKeyRepository: apiKeyRepoA,
    orgMemberRepository: orgRepoA,
  });

  try {
    // Create a campaign with org-A key (increments org-A counter).
    await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': keyA },
      body: JSON.stringify({ name: 'A-camp', description: 'D', rewardPerAction: 1 }),
    });

    // Org-B's usage should be independent.
    const resB = await fetch(`${baseUrl}/api/v1/usage`, {
      headers: { 'x-api-key': keyB },
    });
    const bodyB = /** @type {any} */ (await resB.json());
    const apiCallsB = bodyB.usage.find((/** @type {any} */ u) => u.resource === 'api_calls');
    // org-B's /usage call itself increments its counter by 1, but should not pick up org-A's calls
    assert.ok(
      !apiCallsB || apiCallsB.count <= 1,
      'org-B counter must not be affected by org-A calls',
    );
  } finally {
    await stopTestServer(server);
  }
});
