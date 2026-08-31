// @ts-check
//
// Integration tests for org + RBAC member management routes (#608).
//
// Uses a real SQLite in-memory DB via createApp so every layer
// (migration, DAL, middleware, route) is exercised together.

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../index.js';

const MASTER_KEY = 'test-master-key-608';
const API_KEY_A = 'test-api-key-owner';
const API_KEY_B = 'test-api-key-editor';

async function startTestServer(options = {}) {
  const app = await createApp({
    skipEnvValidation: true,
    masterKey: MASTER_KEY,
    apiKeys: `${API_KEY_A},${API_KEY_B}`,
    disableRedis: true,
    ...options,
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = /** @type {import('net').AddressInfo} */ (server.address());
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopTestServer(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function masterHeaders() {
  return { 'Content-Type': 'application/json', 'X-API-Key': MASTER_KEY };
}

function orgMemberHeaders(key) {
  return { 'Content-Type': 'application/json', 'X-API-Key': key };
}

// ── Org creation ──────────────────────────────────────────────────────────────

test('POST /api/v1/orgs creates an org with master key', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/v1/orgs`, {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ name: 'Acme Corp' }),
    });
    assert.equal(res.status, 201);
    const body = /** @type {any} */ (await res.json());
    assert.equal(body.name, 'Acme Corp');
    assert.equal(typeof body.id, 'string');
    assert.equal(typeof body.createdAt, 'string');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/orgs returns 401 without master key', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/v1/orgs`, {
      method: 'POST',
      headers: orgMemberHeaders(API_KEY_A),
      body: JSON.stringify({ name: 'Acme' }),
    });
    assert.equal(res.status, 401);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/v1/orgs returns 400 when name is missing', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/v1/orgs`, {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = /** @type {any} */ (await res.json());
    assert.equal(body.code, 'VALIDATION_ERROR');
  } finally {
    await stopTestServer(server);
  }
});

// ── Env-key callers have orgRole=owner for backward compat ────────────────────

test('env API keys are treated as owners and can read any org', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    // Create an org with master key.
    const createRes = await fetch(`${baseUrl}/api/v1/orgs`, {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ name: 'Env-Key Org' }),
    });
    const org = /** @type {any} */ (await createRes.json());

    // Env-sourced API key should be able to read it (orgRole=owner).
    const getRes = await fetch(`${baseUrl}/api/v1/orgs/${org.id}`, {
      headers: orgMemberHeaders(API_KEY_A),
    });
    assert.equal(getRes.status, 200);
    const body = /** @type {any} */ (await getRes.json());
    assert.equal(body.id, org.id);
  } finally {
    await stopTestServer(server);
  }
});

// ── 404 for unknown org ───────────────────────────────────────────────────────

test('GET /api/v1/orgs/:id returns 404 for unknown org', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/v1/orgs/nonexistent-id`, {
      headers: orgMemberHeaders(API_KEY_A),
    });
    assert.equal(res.status, 404);
    const body = /** @type {any} */ (await res.json());
    assert.equal(body.code, 'ORG_NOT_FOUND');
  } finally {
    await stopTestServer(server);
  }
});

// ── Org deletion ──────────────────────────────────────────────────────────────

test('DELETE /api/v1/orgs/:id with owner role deletes the org', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const createRes = await fetch(`${baseUrl}/api/v1/orgs`, {
      method: 'POST',
      headers: masterHeaders(),
      body: JSON.stringify({ name: 'Delete Me' }),
    });
    const org = /** @type {any} */ (await createRes.json());

    const delRes = await fetch(`${baseUrl}/api/v1/orgs/${org.id}`, {
      method: 'DELETE',
      headers: orgMemberHeaders(API_KEY_A),
    });
    assert.equal(delRes.status, 204);

    const getRes = await fetch(`${baseUrl}/api/v1/orgs/${org.id}`, {
      headers: orgMemberHeaders(API_KEY_A),
    });
    assert.equal(getRes.status, 404);
  } finally {
    await stopTestServer(server);
  }
});
