import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../index.js';

function createTestApp(options = {}) {
  return createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    masterKey: 'master-key-xyz',
    apiKeys: '',
    ...options,
  });
}

test('admin api key endpoints require master key', async () => {
  const app = await createTestApp();

  await request(app).post('/api/v1/admin/api-keys').send({ label: 'ops' }).expect(401);
  await request(app).get('/api/v1/admin/api-keys').expect(401);
});

test('admin api key lifecycle create list revoke rotate', async () => {
  const app = await createTestApp();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'integration-key' })
    .expect(201);

  assert.ok(created.body.key.startsWith('tk_'));
  assert.equal(created.body.metadata.label, 'integration-key');
  assert.equal(created.body.metadata.active, true);

  const listed = await request(app)
    .get('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .expect(200);

  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].id, created.body.metadata.id);
  assert.equal(listed.body.data[0].label, 'integration-key');

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', created.body.key)
    .send({ name: 'DB Key Campaign', rewardPerAction: 5 })
    .expect(201);

  const rotated = await request(app)
    .put(`/api/v1/admin/api-keys/${created.body.metadata.id}/rotate`)
    .set('X-API-Key', 'master-key-xyz')
    .expect(200);

  assert.notEqual(rotated.body.key, created.body.key);

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', created.body.key)
    .send({ name: 'Revoked Key Campaign', rewardPerAction: 5 })
    .expect(401);

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', rotated.body.key)
    .send({ name: 'Rotated Key Campaign', rewardPerAction: 5 })
    .expect(201);

  await request(app)
    .delete(`/api/v1/admin/api-keys/${rotated.body.metadata.id}`)
    .set('X-API-Key', 'master-key-xyz')
    .expect(204);
});

test('expired database api key is rejected', async () => {
  const app = await createTestApp();
  const expiredAt = new Date(Date.now() - 60_000).toISOString();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'expired', expiresAt: expiredAt })
    .expect(201);

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', created.body.key)
    .send({ name: 'Should Fail', rewardPerAction: 1 })
    .expect(401);
});

// ── Scope tests (#611) ──────────────────────────────────────────────────────

test('read-only key (campaigns:read only) is denied on write routes', async () => {
  const app = await createTestApp();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'readonly', scopes: ['campaigns:read'] })
    .expect(201);

  assert.deepEqual(created.body.metadata.scopes, ['campaigns:read']);

  // Write blocked
  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', created.body.key)
    .send({ name: 'Should Be Blocked', rewardPerAction: 5 })
    .expect(403);
});

test('read-only key can still read public campaign data', async () => {
  const app = await createTestApp();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'readonly-reads', scopes: ['campaigns:read'] })
    .expect(201);

  // Public read endpoints are not guarded by scope (no auth required).
  await request(app).get('/api/v1/campaigns').expect(200);
});

test('full-scope key can write campaigns', async () => {
  const app = await createTestApp();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'writer', scopes: ['campaigns:read', 'campaigns:write'] })
    .expect(201);

  assert.ok(created.body.metadata.scopes.includes('campaigns:write'));

  await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', created.body.key)
    .send({ name: 'Scoped Write Campaign', rewardPerAction: 5 })
    .expect(201);
});

test('api key is org-scoped when orgId is provided', async () => {
  const app = await createTestApp();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'org-key', orgId: 'org-abc', scopes: ['campaigns:read', 'campaigns:write'] })
    .expect(201);

  assert.equal(created.body.metadata.orgId, 'org-abc');
  assert.ok(Array.isArray(created.body.metadata.scopes));
});

test('key metadata includes scopes array on list and getById', async () => {
  const app = await createTestApp();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'scope-check', scopes: ['campaigns:read', 'allowlist:write'] })
    .expect(201);

  const listed = await request(app)
    .get('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .expect(200);

  const found = listed.body.data.find((k) => k.id === created.body.metadata.id);
  assert.ok(found, 'key should appear in list');
  assert.deepEqual(found.scopes, ['campaigns:read', 'allowlist:write']);
});

test('rotated key inherits original scopes and orgId', async () => {
  const app = await createTestApp();

  const created = await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'rotate-scope', orgId: 'org-xyz', scopes: ['campaigns:read'] })
    .expect(201);

  const rotated = await request(app)
    .put(`/api/v1/admin/api-keys/${created.body.metadata.id}/rotate`)
    .set('X-API-Key', 'master-key-xyz')
    .expect(200);

  assert.deepEqual(rotated.body.metadata.scopes, ['campaigns:read']);
  assert.equal(rotated.body.metadata.orgId, 'org-xyz');
  assert.notEqual(rotated.body.key, created.body.key);
});

test('invalid scope value is rejected at creation', async () => {
  const app = await createTestApp();

  await request(app)
    .post('/api/v1/admin/api-keys')
    .set('X-API-Key', 'master-key-xyz')
    .send({ label: 'bad-scope', scopes: ['not:a:valid:scope'] })
    .expect(400);
});
