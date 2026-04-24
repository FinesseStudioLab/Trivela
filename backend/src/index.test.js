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
