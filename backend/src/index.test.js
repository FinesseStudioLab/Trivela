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

test('DELETE /api/campaigns/:id removes a campaign and returns 404 when missing', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    let response = await fetch(`${baseUrl}/api/campaigns/1`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 204);

    response = await fetch(`${baseUrl}/api/campaigns/1`);
    assert.equal(response.status, 404);

    response = await fetch(`${baseUrl}/api/campaigns/999`, {
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

test('CORS allows configured origins and rejects others', async () => {
  const { server, baseUrl } = await startTestServer({
    corsAllowedOrigins: 'https://app.example.com, https://admin.example.com',
  });

  try {
    const allowedRes = await fetch(`${baseUrl}/api/v1`, {
      headers: { origin: 'https://app.example.com' },
    });
    assert.equal(allowedRes.status, 200);
    assert.equal(allowedRes.headers.get('access-control-allow-origin'), 'https://app.example.com');

    const deniedRes = await fetch(`${baseUrl}/api/v1`, {
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(deniedRes.status, 200);
    assert.equal(deniedRes.headers.get('access-control-allow-origin'), null);
  } finally {
    await stopTestServer(server);
  }
});

test('CORS production default is safe (no open origins)', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const { server, baseUrl } = await startTestServer({});

  try {
    const response = await fetch(`${baseUrl}/api/v1`, {
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    await stopTestServer(server);
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('POST /api/campaigns creates a new campaign and returns it', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const newCampaign = {
      name: 'Test Campaign',
      description: 'A test campaign',
      rewardPerAction: 50,
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
    assert.ok(created.id);
    assert.ok(created.createdAt);

    // Verify it's in the list
    const listResponse = await fetch(`${baseUrl}/api/campaigns`);
    const list = await listResponse.json();
    const found = list.data.find((c) => c.id === created.id);
    assert.ok(found);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/campaigns/:id updates an existing campaign', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const updateData = {
      name: 'Updated Name',
      active: false,
    };

    const response = await fetch(`${baseUrl}/api/campaigns/1`, {
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

    // Verify 404 for missing
    const missingResponse = await fetch(`${baseUrl}/api/campaigns/999`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });
    assert.equal(missingResponse.status, 404);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/campaigns?active=true returns only active campaigns', async () => {
  const seed = [
    { id: '1', name: 'Active One', description: '', active: true, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '2', name: 'Inactive One', description: '', active: false, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '3', name: 'Active Two', description: '', active: true, rewardPerAction: 10, createdAt: new Date().toISOString() },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/campaigns?active=true`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 2);
    assert.ok(body.data.every((c) => c.active === true));
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/campaigns?active=false returns only inactive campaigns', async () => {
  const seed = [
    { id: '1', name: 'Active One', description: '', active: true, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '2', name: 'Inactive One', description: '', active: false, rewardPerAction: 5, createdAt: new Date().toISOString() },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/campaigns?active=false`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].active, false);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/campaigns without active param returns all campaigns', async () => {
  const seed = [
    { id: '1', name: 'Active One', description: '', active: true, rewardPerAction: 5, createdAt: new Date().toISOString() },
    { id: '2', name: 'Inactive One', description: '', active: false, rewardPerAction: 5, createdAt: new Date().toISOString() },
  ];
  const { server, baseUrl } = await startTestServer({ campaigns: seed });

  try {
    const response = await fetch(`${baseUrl}/api/campaigns`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 2);
  } finally {
    await stopTestServer(server);
  }
});
