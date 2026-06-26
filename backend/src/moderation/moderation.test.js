import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../index.js';
import { createModerationService } from './moderationService.js';

// ── Unit tests: moderationService ────────────────────────────────────────────

test('moderationService (local): flags content containing a blocked term', async () => {
  const svc = createModerationService({ provider: 'local', terms: ['spam', 'buy now'] });
  const result = await svc.check({ name: 'Buy Now Exclusive', description: 'great deal' });
  assert.equal(result.flagged, true);
  assert.deepEqual(result.categories, ['spam']);
});

test('moderationService (local): passes clean content', async () => {
  const svc = createModerationService({ provider: 'local', terms: ['spam', 'buy now'] });
  const result = await svc.check({ name: 'Summer Referral', description: 'Earn points' });
  assert.equal(result.flagged, false);
  assert.deepEqual(result.categories, []);
});

test('moderationService (local): checks description and tags too', async () => {
  const svc = createModerationService({ provider: 'local', terms: ['free money'] });
  const result = await svc.check({
    name: 'Good Name',
    description: 'Earn free money now',
    tags: [],
  });
  assert.equal(result.flagged, true);
});

test('moderationService (local): tags are checked', async () => {
  const svc = createModerationService({ provider: 'local', terms: ['click here'] });
  const result = await svc.check({ name: 'Normal', description: 'Normal', tags: ['click here'] });
  assert.equal(result.flagged, true);
});

test('moderationService (none): always passes', async () => {
  const svc = createModerationService({ provider: 'none', terms: ['spam'] });
  const result = await svc.check({ name: 'spam spam spam', description: 'buy now' });
  assert.equal(result.flagged, false);
  assert.deepEqual(result.categories, []);
});

test('moderationService: addTerm and removeTerm update in-memory list', async () => {
  const svc = createModerationService({ provider: 'local', terms: ['spam'] });

  assert.equal((await svc.check({ name: 'new evil word' })).flagged, false);
  svc.addTerm('evil word');
  assert.equal((await svc.check({ name: 'new evil word' })).flagged, true);

  svc.removeTerm('evil word');
  assert.equal((await svc.check({ name: 'new evil word' })).flagged, false);
});

test('moderationService: getTerms returns current list', () => {
  const svc = createModerationService({ provider: 'local', terms: ['alpha', 'beta'] });
  assert.deepEqual(svc.getTerms().sort(), ['alpha', 'beta']);
  svc.addTerm('gamma');
  assert.deepEqual(svc.getTerms().sort(), ['alpha', 'beta', 'gamma']);
});

// ── Integration tests: HTTP endpoints ────────────────────────────────────────

async function startTestServer(options = {}) {
  const app = await createApp({
    disableJobs: true,
    disableWebSocket: true,
    dbPath: ':memory:',
    ...options,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopTestServer(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('POST /api/v1/campaigns: blocked term returns 422 with categories', async () => {
  const blockedSvc = createModerationService({ provider: 'local', terms: ['buy now'] });
  const { server, baseUrl } = await startTestServer({
    apiKey: 'test-key',
    moderationService: blockedSvc,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({
        name: 'Buy Now and Win',
        description: 'Great campaign',
        rewardPerAction: 5,
      }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error, 'Content violates community guidelines');
    assert.ok(Array.isArray(body.categories));
    assert.ok(body.categories.length > 0);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns: clean content passes moderation and creates campaign', async () => {
  const cleanSvc = createModerationService({ provider: 'local', terms: ['buy now'] });
  const { server, baseUrl } = await startTestServer({
    apiKey: 'test-key',
    moderationService: cleanSvc,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
      body: JSON.stringify({
        name: 'Summer Referral Programme',
        description: 'Earn points for every friend you refer',
        rewardPerAction: 10,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(typeof body.id, 'string');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns: override_moderation bypasses check for env-sourced (admin) API key', async () => {
  const strictSvc = createModerationService({ provider: 'local', terms: ['buy now'] });
  // 'admin-key' is env-sourced (passed via apiKey option → source: 'env')
  const { server, baseUrl } = await startTestServer({
    apiKey: 'admin-key',
    moderationService: strictSvc,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'admin-key' },
      body: JSON.stringify({
        name: 'Buy Now Admin Test',
        description: 'Admin override test',
        rewardPerAction: 1,
        override_moderation: true,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(typeof body.id, 'string');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/admin/moderation/blocklist: add and remove terms', async () => {
  const svc = createModerationService({ provider: 'local', terms: ['spam'] });
  const { server, baseUrl } = await startTestServer({
    masterKey: 'admin-key',
    moderationService: svc,
  });

  try {
    // Add a term
    const addRes = await fetch(`${baseUrl}/api/v1/admin/moderation/blocklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'admin-key' },
      body: JSON.stringify({ action: 'add', term: 'new-blocked-term' }),
    });
    assert.equal(addRes.status, 200);
    const addBody = await addRes.json();
    assert.ok(addBody.terms.includes('new-blocked-term'));

    // Remove the term
    const removeRes = await fetch(`${baseUrl}/api/v1/admin/moderation/blocklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'admin-key' },
      body: JSON.stringify({ action: 'remove', term: 'new-blocked-term' }),
    });
    assert.equal(removeRes.status, 200);
    const removeBody = await removeRes.json();
    assert.ok(!removeBody.terms.includes('new-blocked-term'));
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/admin/moderation/blocklist: returns current terms', async () => {
  const svc = createModerationService({ provider: 'local', terms: ['alpha', 'beta'] });
  const { server, baseUrl } = await startTestServer({
    masterKey: 'admin-key',
    moderationService: svc,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/admin/moderation/blocklist`, {
      headers: { 'X-API-Key': 'admin-key' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.terms));
    assert.deepEqual(body.terms.sort(), ['alpha', 'beta']);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/admin/moderation/blocklist: requires master key', async () => {
  const svc = createModerationService({ provider: 'local', terms: [] });
  const { server, baseUrl } = await startTestServer({
    apiKey: 'regular-key',
    masterKey: 'admin-key',
    moderationService: svc,
  });

  try {
    const res = await fetch(`${baseUrl}/api/v1/admin/moderation/blocklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'regular-key' },
      body: JSON.stringify({ action: 'add', term: 'test' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await stopTestServer(server);
  }
});
