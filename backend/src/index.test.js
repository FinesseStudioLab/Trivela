import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from './index.js';

async function startTestServer(options = {}) {
  const app = await createApp(options);
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
  assert.ok(
    ['active', 'upcoming', 'ended'].includes(campaign.status),
    `unexpected status: ${campaign.status}`,
  );
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
    const body = await response.json();
    assert.equal(body.error, 'Campaign not found');
    assert.equal(body.code, 'CAMPAIGN_NOT_FOUND');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns/:id/stats returns analytics payload', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/1/stats?range=7d`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.campaignId, '1');
    assert.ok(body.summary);
    assert.ok(Array.isArray(body.registrationsByDay));
    assert.ok(Array.isArray(body.pointsByDay));
    assert.equal(typeof body.onChainSynced, 'boolean');
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
    const deleteNotFoundBody = await response.json();
    assert.equal(deleteNotFoundBody.error, 'Campaign not found');
    assert.equal(deleteNotFoundBody.code, 'CAMPAIGN_NOT_FOUND');
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
    const rlBody = await secondResponse.json();
    assert.equal(rlBody.error, 'Rate limit exceeded');
    assert.equal(rlBody.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(rlBody.keying, 'per API key when present, otherwise per IP address');
    assert.equal(rlBody.limit, 1);
    assert.equal(rlBody.windowMs, 60_000);
    assert.equal(rlBody.retryAfterSeconds, 60);
  } finally {
    await stopTestServer(server);
  }
});

test('createApp rejects invalid contract IDs in configuration', async () => {
  await assert.rejects(
    () => createApp({ REWARDS_CONTRACT_ID: 'invalid-id' }),
    /REWARDS_CONTRACT_ID must be a valid Stellar contract ID/,
  );

  await assert.rejects(
    () => createApp({ CAMPAIGN_CONTRACT_ID: 'GABC' }),
    /CAMPAIGN_CONTRACT_ID must be a valid Stellar contract ID/,
  );

  await assert.rejects(
    () => createApp({ stellarNetwork: 'pubnet' }),
    /Unsupported STELLAR_NETWORK "pubnet"/,
  );
});
test('POST /api/v1/campaigns returns 400 for invalid slug format', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Slug',
        slug: 'Invalid_Slug_Format!',
        rewardPerAction: 10,
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.ok(body.error.includes('Kebab-case only'));
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/campaigns returns 400 for invalid date range', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Dates',
        rewardPerAction: 10,
        startDate: '2026-02-01T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z',
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.ok(body.error.includes('Start date must be before end date'));
  } finally {
    await stopTestServer(server);
  }
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
    assert.equal(
      payload.stellar.networkPassphrase,
      'Public Global Stellar Network ; September 2015',
    );
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
    assert.deepEqual(calls[0], [
      'list',
      { active: undefined, q: 'injected', sort: undefined, order: undefined },
    ]);
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

test('POST /api/campaigns creates a new campaign via legacy route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const newCampaign = {
      name: 'Legacy Campaign',
      description: 'Created through legacy route',
      rewardPerAction: 15,
    };
    const response = await fetch(`${baseUrl}/api/campaigns`, {
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
    const missingBody = await missingResponse.json();
    assert.equal(missingBody.error, 'Campaign not found');
    assert.equal(missingBody.code, 'CAMPAIGN_NOT_FOUND');
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/v1/campaigns/:id with partial fields preserves untouched fields', async () => {
  const seed = [
    {
      id: '1',
      name: 'Original Name',
      description: 'Original description',
      active: true,
      rewardPerAction: 25,
      createdAt: new Date().toISOString(),
    },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });

    assert.equal(response.status, 200);
    const updated = await response.json();
    assert.equal(updated.active, false);
    assert.equal(updated.name, 'Original Name', 'name should be preserved');
    assert.equal(updated.description, 'Original description', 'description should be preserved');
    assert.equal(updated.rewardPerAction, 25, 'rewardPerAction should be preserved');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns?active=true returns only active campaigns', async () => {
  const seed = [
    {
      id: '1',
      name: 'Active One',
      description: '',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Inactive One',
      description: '',
      active: false,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: '3',
      name: 'Active Two',
      description: '',
      active: true,
      rewardPerAction: 10,
      createdAt: new Date().toISOString(),
    },
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
    {
      id: '1',
      name: 'Active One',
      description: '',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Inactive One',
      description: '',
      active: false,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
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

test('GET /api/v1/campaigns?active=invalid ignores the filter and returns all campaigns', async () => {
  const seed = [
    {
      id: '1',
      name: 'Active One',
      description: '',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Inactive One',
      description: '',
      active: false,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?active=garbage`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 2);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns without active param returns all campaigns', async () => {
  const seed = [
    {
      id: '1',
      name: 'Active One',
      description: '',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Inactive One',
      description: '',
      active: false,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
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
      body: JSON.stringify({
        name: 'Live Campaign',
        rewardPerAction: 5,
        startDate: past,
        endDate: future,
      }),
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
    const slugBody = await response.json();
    assert.equal(slugBody.error, 'Campaign not found');
    assert.equal(slugBody.code, 'CAMPAIGN_NOT_FOUND');
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

test('createApp defaults to deny-by-default CORS in production when not configured', async () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const { server, baseUrl } = await startTestServer({ corsAllowedOrigins: '' });
    try {
      const deniedResp = await fetch(`${baseUrl}/api/v1/campaigns`, {
        headers: {
          Origin: 'https://unknown-origin.example',
        },
      });
      assert.equal(deniedResp.status, 200);
      assert.strictEqual(deniedResp.headers.get('access-control-allow-origin'), null);
    } finally {
      await stopTestServer(server);
    }

    await assert.rejects(
      () => createApp({ corsAllowedOrigins: '*' }),
      /Wildcard origins are not permitted/,
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

// #232 — featured flag: ordering and admin toggle
test('GET /api/v1/campaigns returns featured campaigns first', async () => {
  const seed = [
    {
      name: 'Regular A',
      description: '',
      active: true,
      rewardPerAction: 1,
      createdAt: new Date().toISOString(),
    },
    {
      name: 'Regular B',
      description: '',
      active: true,
      rewardPerAction: 1,
      createdAt: new Date().toISOString(),
    },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    // Mark the second campaign as featured via PUT
    await fetch(`${baseUrl}/api/v1/campaigns/2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: true }),
    });

    const response = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data[0].id, '2');
    assert.equal(body.data[0].featured, true);
    assert.equal(body.data[1].featured, false);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/v1/campaigns/:id can set and unset featured', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const setResp = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: true }),
    });
    assert.equal(setResp.status, 200);
    const set = await setResp.json();
    assert.equal(set.featured, true);

    const unsetResp = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: false }),
    });
    assert.equal(unsetResp.status, 200);
    const unset = await unsetResp.json();
    assert.equal(unset.featured, false);
  } finally {
    await stopTestServer(server);
  }
});

// #234 — hidden flag: moderation
test('hidden campaigns do not appear in GET /api/v1/campaigns list', async () => {
  const seed = [
    {
      name: 'Visible Campaign',
      description: '',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      name: 'Spam Campaign',
      description: '',
      active: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    // Hide the second campaign
    await fetch(`${baseUrl}/api/v1/campaigns/2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: true, hiddenReason: 'spam' }),
    });

    const listResp = await fetch(`${baseUrl}/api/v1/campaigns`);
    const body = await listResp.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].name, 'Visible Campaign');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/campaigns/:id still returns a hidden campaign by id', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: true, hiddenReason: 'abuse' }),
    });

    const resp = await fetch(`${baseUrl}/api/v1/campaigns/1`);
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.hidden, true);
    assert.equal(body.hiddenReason, 'abuse');
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/v1/campaigns/:id rejects non-boolean hidden and non-string hiddenReason', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const resp = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: 'yes' }),
    });
    assert.equal(resp.status, 400);

    const resp2 = await fetch(`${baseUrl}/api/v1/campaigns/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenReason: 42 }),
    });
    assert.equal(resp2.status, 400);
  } finally {
    await stopTestServer(server);
  }
});

// #230 — explorer endpoint
test('GET /api/v1/explorer returns correct URL for testnet', async () => {
  const { server, baseUrl } = await startTestServer({ stellarNetwork: 'testnet' });

  try {
    const response = await fetch(`${baseUrl}/api/v1/explorer`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.network, 'testnet');
    assert.equal(body.explorerUrl, 'https://stellar.expert/explorer/testnet');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/explorer returns correct URL for mainnet', async () => {
  const { server, baseUrl } = await startTestServer({ stellarNetwork: 'mainnet' });

  try {
    const response = await fetch(`${baseUrl}/api/v1/explorer`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.network, 'mainnet');
    assert.equal(body.explorerUrl, 'https://stellar.expert/explorer/public');
  } finally {
    await stopTestServer(server);
  }
});

test('API response compression is applied to payloads larger than 1KB', async () => {
  const largeCampaign = {
    name: 'A'.repeat(600),
    description: 'B'.repeat(600),
    active: true,
    rewardPerAction: 10,
    createdAt: new Date().toISOString(),
  };
  const { server, baseUrl } = await startTestServer({ campaigns: [largeCampaign] });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      headers: {
        'Accept-Encoding': 'gzip',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
  } finally {
    await stopTestServer(server);
  }
});

test('API response compression is NOT applied to payloads smaller than 1KB', async () => {
  const smallCampaign = {
    name: 'Small',
    description: 'Short',
    active: true,
    rewardPerAction: 10,
    createdAt: new Date().toISOString(),
  };
  const { server, baseUrl } = await startTestServer({ campaigns: [smallCampaign] });

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`, {
      headers: {
        'Accept-Encoding': 'gzip',
      },
    });
    assert.equal(response.status, 200);
    assert.strictEqual(response.headers.get('content-encoding'), null);
  } finally {
    await stopTestServer(server);
  }
});

// #493 — API migration compatibility shim
test('?api_version=v0 compatibility shim rewrites v1 routes to legacy patterns', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?api_version=v0`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('deprecation'), 'true');
    assert.equal(response.headers.get('sunset'), 'Sat, 01 Jul 2026 00:00:00 GMT');
  } finally {
    await stopTestServer(server);
  }
});

test('?api_version=v0 compatibility shim returns Deprecation header on create', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns?api_version=v0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Compat Test', rewardPerAction: 10 }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('deprecation'), 'true');
    const body = await response.json();
    assert.equal(body.name, 'Compat Test');
  } finally {
    await stopTestServer(server);
  }
});

test('requests without api_version=v0 do not include Deprecation header', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/campaigns`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('deprecation'), null);
  } finally {
    await stopTestServer(server);
  }
});

// #467 — Admin dashboard endpoint
test('GET /api/v1/admin/dashboard requires master key authentication', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/dashboard`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'UNAUTHORIZED');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/admin/dashboard returns aggregated stats with master key', async () => {
  const seedCampaigns = [
    {
      name: 'Active Campaign',
      active: true,
      hidden: false,
      rewardPerAction: 10,
      createdAt: new Date().toISOString(),
    },
    {
      name: 'Draft Campaign',
      active: false,
      hidden: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
    {
      name: 'Archived Campaign',
      active: false,
      hidden: false,
      rewardPerAction: 15,
      createdAt: new Date().toISOString(),
    },
  ];
  const { server, baseUrl } = await startTestServer({
    campaigns: seedCampaigns,
    masterKey: 'test-master-key',
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/dashboard`, {
      headers: { 'X-API-Key': 'test-master-key' },
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.ok(body.campaigns);
    assert.equal(body.campaigns.total, 3);
    assert.equal(body.campaigns.byStatus.draft, 1);
    assert.equal(body.campaigns.byStatus.published, 1);
    assert.equal(body.campaigns.byStatus.archived, 1);
    assert.ok(body.participants);
    assert.ok(typeof body.participants.total === 'number');
    assert.ok(body.rewards);
    assert.ok(Array.isArray(body.activity));
    assert.equal(body.activity.length, 30);
    assert.ok(body.errors);
    assert.ok(body.rpc);
    assert.ok(body.timestamp);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/admin/dashboard caches response for 60 seconds', async () => {
  const { server, baseUrl } = await startTestServer({
    masterKey: 'test-master-key',
  });

  try {
    const response1 = await fetch(`${baseUrl}/api/v1/admin/dashboard`, {
      headers: { 'X-API-Key': 'test-master-key' },
    });
    assert.equal(response1.status, 200);
    assert.equal(response1.headers.get('x-cache'), 'MISS');

    const response2 = await fetch(`${baseUrl}/api/v1/admin/dashboard`, {
      headers: { 'X-API-Key': 'test-master-key' },
    });
    assert.equal(response2.status, 200);
    assert.equal(response2.headers.get('x-cache'), 'HIT');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/admin/campaigns requires master key authentication', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/campaigns`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, 'UNAUTHORIZED');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/v1/admin/campaigns returns all campaigns including hidden with master key', async () => {
  const seedCampaigns = [
    {
      name: 'Public Campaign',
      active: true,
      hidden: false,
      rewardPerAction: 10,
      createdAt: new Date().toISOString(),
    },
    {
      name: 'Hidden Campaign',
      active: true,
      hidden: true,
      rewardPerAction: 5,
      createdAt: new Date().toISOString(),
    },
  ];
  const { server, baseUrl } = await startTestServer({
    campaigns: seedCampaigns,
    masterKey: 'test-master-key',
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/campaigns`, {
      headers: { 'X-API-Key': 'test-master-key' },
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 2);
    assert.ok(body.data.some((c) => c.name === 'Public Campaign'));
    assert.ok(body.data.some((c) => c.name === 'Hidden Campaign'));
    assert.ok(body.pagination);
  } finally {
    await stopTestServer(server);
  }
});
