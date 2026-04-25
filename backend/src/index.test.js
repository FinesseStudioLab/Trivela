import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from './index.js';

async function startTestServer(options = {}) {
  const app = createApp(options);
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function campaignShapeAssertions(campaign) {
  assert.equal(typeof campaign.id, 'string');
  assert.equal(typeof campaign.name, 'string');
  assert.equal(typeof campaign.description, 'string');
  assert.equal(typeof campaign.active, 'boolean');
  assert.equal(typeof campaign.rewardPerAction, 'number');
  assert.equal(typeof campaign.createdAt, 'string');
  assert.ok(['active', 'upcoming', 'ended'].includes(campaign.status), `unexpected status: ${campaign.status}`);
  assert.ok(campaign.startDate === null || typeof campaign.startDate === 'string');
  assert.ok(campaign.endDate === null || typeof campaign.endDate === 'string');
}

test('GET /api/v1 exposes versioning details and legacy compatibility guidance', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.prefix, '/api/v1');
    assert.equal(payload.compatibility.legacyPrefix, '/api');
    assert.equal(payload.compatibility.legacyRoutesSupported, true);
    assert.match(payload.compatibility.migrationNote, /Prefer \/api\/v1/);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns returns paginated campaign data with the expected shape', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.ok(Array.isArray(payload.data));
    assert.ok(payload.pagination);
    assert.ok(payload.data.length >= 1);
    campaignShapeAssertions(payload.data[0]);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns/:id returns 404 for a missing campaign', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/999`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Campaign not found' });
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/campaigns and /api/v1/campaigns stay backward compatible', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const [legacyResponse, versionedResponse] = await Promise.all([
      fetch(`${baseUrl}/api/campaigns`),
      fetch(`${baseUrl}/api/v1/campaigns`),
    ]);

    assert.equal(legacyResponse.status, 200);
    assert.equal(versionedResponse.status, 200);
    assert.deepEqual(await legacyResponse.json(), await versionedResponse.json());
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/v1/campaigns/:id removes a campaign and returns 404 when missing', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    let response = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 204);

    response = await fetch(`${baseUrl}/api/v1/campaigns/1`);
    assert.equal(response.status, 404);

    response = await fetch(`${baseUrl}/api/v1/campaigns/999`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Campaign not found' });
  } finally {
    await stopTestServer(server);
  }
});

test('rate limiting applies to API routes', async () => {
  const { server, baseUrl } = await startTestServer({
    rateLimit: {
      windowMs: 60_000,
      maxRequests: 1,
    },
  });

  try {
    const firstResponse = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get('x-ratelimit-limit'), '1');
    assert.equal(firstResponse.headers.get('x-ratelimit-remaining'), '0');
    assert.ok(firstResponse.headers.get('x-ratelimit-reset'));
    assert.ok(firstResponse.headers.get('ratelimit-policy'));
    assert.ok(firstResponse.headers.get('ratelimit'));

    const secondResponse = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(secondResponse.status, 429);
    assert.equal(secondResponse.headers.get('retry-after'), '60');
    assert.deepEqual(await secondResponse.json(), {
      error: 'Rate limit exceeded',
      keying: 'per API key when present, otherwise per IP address',
      limit: 1,
      windowMs: 60_000,
      retryAfterSeconds: 60,
    });
  } finally {
    await stopTestServer(server);
  }
});

test('createApp rejects invalid contract IDs in configuration', () => {
  assert.throws(
    () => createApp({ REWARDS_CONTRACT_ID: 'invalid-id' }),
    /REWARDS_CONTRACT_ID must be a valid Stellar contract ID/,
  );

  assert.throws(
    () => createApp({ CAMPAIGN_CONTRACT_ID: 'GABC' }),
    /CAMPAIGN_CONTRACT_ID must be a valid Stellar contract ID/,
  );

  assert.throws(
    () => createApp({ stellarNetwork: 'pubnet' }),
    /Unsupported STELLAR_NETWORK "pubnet"/,
  );
});

test('GET /api/v1/config exposes explicit stellar network metadata', async () => {
  const { server, baseUrl } = await startTestServer({
    stellarNetwork: 'mainnet',
    REWARDS_CONTRACT_ID: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/config`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.stellar.network, 'mainnet');
    assert.equal(payload.stellar.networkPassphrase, 'Public Global Stellar Network ; September 2015');
    assert.equal(payload.stellar.sorobanRpcUrl, 'https://soroban-mainnet.stellar.org');
    assert.equal(payload.stellar.horizonUrl, 'https://horizon.stellar.org');
    assert.equal(
      payload.contracts.rewards,
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    );
    assert.equal(payload.contracts.campaign, null);
  } finally {
    await stopTestServer(server);
  }
});

test('createApp supports injected campaign repositories', async () => {
  const calls = [];
  const repository = {
    list(filters) {
      calls.push(['list', filters]);
      return [
        {
          id: '99',
          name: 'Injected Campaign',
          slug: 'injected-campaign',
          description: 'From repository stub',
          active: true,
          rewardPerAction: 12,
          createdAt: '2026-04-24T00:00:00.000Z',
        },
      ];
    },
    getById(id) {
      calls.push(['getById', id]);
      return undefined;
    },
    getBySlug(slug) {
      calls.push(['getBySlug', slug]);
      return undefined;
    },
    create(input) {
      calls.push(['create', input]);
      return {
        id: '100',
        slug: input.slug || 'generated-slug',
        active: true,
        createdAt: '2026-04-24T00:00:00.000Z',
        ...input,
      };
    },
    update(id, input) {
      calls.push(['update', id, input]);
      return undefined;
    },
    delete(id) {
      calls.push(['delete', id]);
      return false;
    },
  };
  const { server, baseUrl } = await startTestServer({
    campaignRepository: repository,
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?q=injected`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data[0].id, '99');
    assert.deepEqual(calls[0], ['list', { active: undefined, q: 'injected' }]);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns supports text search with q parameter', async () => {
  const seed = [
    {
      id: '1',
      name: 'Stellar Quest',
      description: 'Rewards for onboarding',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Builder Sprint',
      description: 'Campaign for dev tooling',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });
  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?q=stellar`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].name, 'Stellar Quest');
  } finally {
    await stopTestServer(server);
  }
});

test('/health includes Soroban RPC health when the RPC is reachable', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://rpc.example');
    assert.equal(init.method, 'POST');
    assert.equal(JSON.parse(init.body).method, 'getNetwork');

    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'health-check',
        result: {
          friendbotUrl: 'https://friendbot.example',
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };

  const { server, baseUrl } = await startTestServer({
    sorobanRpcUrl: 'https://rpc.example',
    fetchImpl,
  });

  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.rpc.status, 'ok');
    assert.equal(payload.rpc.url, 'https://rpc.example');
    assert.equal(payload.rpc.method, 'getNetwork');
  } finally {
    await stopTestServer(server);
  }
});

test('/health/rpc returns 503 when the Soroban RPC health check fails', async () => {
  const fetchImpl = async () => {
    throw new Error('connection refused');
  };

  const { server, baseUrl } = await startTestServer({
    sorobanRpcUrl: 'https://rpc.example',
    fetchImpl,
  });

  try {
    const response = await fetch(`${baseUrl}/health/rpc`);
    assert.equal(response.status, 503);

    const payload = await response.json();
    assert.equal(payload.status, 'error');
    assert.equal(payload.url, 'https://rpc.example');
    assert.match(payload.error, /connection refused/);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /metrics exposes minimal Prometheus metrics', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await fetch(`${baseUrl}/api/v1/campaigns`);
    const response = await fetch(`${baseUrl}/metrics`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/plain/);

    const body = await response.text();
    assert.match(body, /trivela_requests_total \d+/);
    assert.match(body, /trivela_request_errors_total \d+/);
    assert.match(body, /trivela_process_uptime_seconds [0-9.]+/);
    assert.match(body, /trivela_route_hits_total\{route="GET \/api\/v1\/campaigns"\} \d+/);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns creates a new campaign and returns it', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const newCampaign = {
      name: 'Test Campaign',
      description: 'A test campaign',
      rewardPerAction: 50,
    };

    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newCampaign),
    });

    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.name, newCampaign.name);
    assert.equal(created.description, newCampaign.description);
    assert.equal(created.rewardPerAction, newCampaign.rewardPerAction);
    campaignShapeAssertions(created);

    // Verify it's in the list
    const listResponse = await fetch(`${baseUrl}/api/v1/campaigns`);
    const list = await listResponse.json();
    const found = list.data.find((c) => c.id === created.id);
    assert.ok(found);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/v1/campaigns/:id updates an existing campaign and returns 404 when missing', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const updateData = {
      name: 'Updated Name',
      active: false,
    };

    const response = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    assert.equal(response.status, 200);
    const updated = await response.json();
    assert.equal(updated.id, '1');
    assert.equal(updated.name, updateData.name);
    assert.equal(updated.active, updateData.active);
    campaignShapeAssertions(updated);

    // Verify 404 for missing
    const missingResponse = await fetch(`${baseUrl}/api/v1/campaigns/999`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });
    assert.equal(missingResponse.status, 404);
    assert.deepEqual(await missingResponse.json(), { error: 'Campaign not found' });
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns?active=true returns only active campaigns', async () => {
  const seed = [
    { id: '1', name: 'Active One', description: '', active: true, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '2', name: 'Inactive One', description: '', active: false, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '3', name: 'Active Two', description: '', active: true, rewardPerAction: 10, createdAt: new Date().toISOString() },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?active=true`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 2);
    assert.ok(body.data.every((c) => c.active === true));
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns?active=false returns only inactive campaigns', async () => {
  const seed = [
    { id: '1', name: 'Active One', description: '', active: true, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '2', name: 'Inactive One', description: '', active: false, rewardPerAction: 5, createdAt: new Date().toISOString() },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?active=false`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].active, false);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns without active param returns all campaigns', async () => {
  const seed = [
    { id: '1', name: 'Active One', description: '', active: true, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '2', name: 'Inactive One', description: '', active: false, rewardPerAction: 5, createdAt: new Date().toISOString() },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 2);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/indexer/cursor exposes cursor state for indexers', async () => {
  const { server, baseUrl } = await startTestServer({
    initialIndexerCursor: 'ledger:123:event:8',
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/indexer/cursor`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.cursor, 'ledger:123:event:8');
    assert.equal(typeof payload.updatedAt, 'string');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns accepts startDate and endDate and returns computed status', async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const { server, baseUrl } = await startTestServer();

  try {
    const upcomingResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Future Campaign', rewardPerAction: 5, startDate: future }),
    });
    assert.equal(upcomingResp.status, 201);
    const upcoming = await upcomingResp.json();
    assert.equal(upcoming.status, 'upcoming');
    assert.equal(upcoming.startDate, future);
    assert.equal(upcoming.endDate, null);

    const endedResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Past Campaign', rewardPerAction: 5, endDate: past }),
    });
    assert.equal(endedResp.status, 201);
    const ended = await endedResp.json();
    assert.equal(ended.status, 'ended');

    const activeResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Live Campaign', rewardPerAction: 5, startDate: past, endDate: future }),
    });
    assert.equal(activeResp.status, 201);
    const active = await activeResp.json();
    assert.equal(active.status, 'active');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns rejects invalid date strings', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Dates', rewardPerAction: 5, startDate: 'not-a-date' }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.details.some((d) => /startDate/.test(d)));
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/v1/campaigns/:id can update startDate and endDate', async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const { server, baseUrl } = await startTestServer();

  try {
    const resp = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: future }),
    });
    assert.equal(resp.status, 200);
    const updated = await resp.json();
    assert.equal(updated.startDate, future);
    assert.equal(updated.status, 'upcoming');
  } finally {
    await stopTestServer(server);
  }
});

test('campaign list endpoint returns cache headers with short TTL cache', async () => {
  const { server, baseUrl } = await startTestServer({
    shortCacheTtlMs: 10_000,
  });

  try {
    const first = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-cache'), 'MISS');

    const second = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('x-cache'), 'HIT');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns/by-slug/:slug retrieves campaign by slug', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const createResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Slug Test Campaign', rewardPerAction: 10 }),
    });
    assert.equal(createResp.status, 201);
    const created = await createResp.json();
    assert.equal(created.slug, 'slug-test-campaign');

    const getResp = await fetch(`${baseUrl}/api/v1/campaigns/by-slug/slug-test-campaign`);
    assert.equal(getResp.status, 200);
    const retrieved = await getResp.json();
    assert.equal(retrieved.id, created.id);
    assert.equal(retrieved.name, 'Slug Test Campaign');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns/by-slug/:slug returns 404 for missing slug', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/by-slug/nonexistent-slug`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Campaign not found' });
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns with explicit slug uses provided slug', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Custom Slug', slug: 'my-custom-slug', rewardPerAction: 10 }),
    });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.slug, 'my-custom-slug');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns rejects duplicate slugs with 409', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const first = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First Campaign', slug: 'duplicate', rewardPerAction: 10 }),
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Second Campaign', slug: 'duplicate', rewardPerAction: 10 }),
    });
    assert.equal(second.status, 409);
    const body = await second.json();
    assert.equal(body.error, 'Slug already exists');
  } finally {
    await stopTestServer(server);
  }
});

test('CORS preflight OPTIONS request returns correct headers for allowed origin', async () => {
  const { server, baseUrl } = await startTestServer({
    corsAllowedOrigins: 'https://example.com,https://other.com',
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://example.com');
    assert.ok(response.headers.get('access-control-allow-methods'));
    assert.ok(response.headers.get('access-control-allow-headers'));
    assert.equal(response.headers.get('access-control-max-age'), '86400');
  } finally {
    await stopTestServer(server);
  }
});

test('CORS preflight caching headers are set', async () => {
  const { server, baseUrl } = await startTestServer({
    corsAllowedOrigins: 'https://example.com',
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-max-age'), '86400');
  } finally {
    await stopTestServer(server);
  }
});

test('CORS allows requests from allowed origins', async () => {
  const { server, baseUrl } = await startTestServer({
    corsAllowedOrigins: 'https://allowed.com,http://localhost:3000',
  });

  try {
    const allowedResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
      headers: {
        Origin: 'https://allowed.com',
      },
    });
    assert.equal(allowedResp.status, 200);
    assert.equal(allowedResp.headers.get('access-control-allow-origin'), 'https://allowed.com');

    const localhostResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });
    assert.equal(localhostResp.status, 200);
    assert.equal(localhostResp.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  } finally {
    await stopTestServer(server);
  }
});

test('CORS rejects requests from non-allowed origins', async () => {
  const { server, baseUrl } = await startTestServer({
    corsAllowedOrigins: 'https://allowed.com',
  });

  try {
    // Request from disallowed origin
    const deniedResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
      headers: {
        Origin: 'https://denied.com',
      },
    });
    assert.equal(deniedResp.status, 200);
    // CORS middleware doesn't block the request but omits the allow-origin header
    assert.strictEqual(deniedResp.headers.get('access-control-allow-origin'), null);
  } finally {
    await stopTestServer(server);
  }
});

test('createApp throws in production when CORS is not configured', () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(
      () => createApp({ corsAllowedOrigins: '' }),
      /CORS_ALLOWED_ORIGINS must be explicitly configured in production/,
    );

    assert.throws(
      () => createApp({ corsAllowedOrigins: '*' }),
      /Wildcard origins are not permitted/,
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
