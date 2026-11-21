/**
 * Quickstart snippet tests (#1611).
 *
 * These tests verify that the code examples shown in sdk/README.md
 * compile and run correctly against a stub fetch implementation.
 * They are intentionally thin: they exercise the public API surface
 * used by integrators (createClient, post, get, TrivelaHttpError)
 * rather than internal implementation details.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, TrivelaHttpError } from '../src/http.ts';

function okFetch(body: unknown, status = 200) {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

function errorFetch(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status });
}

// ── Quickstart: initialise ──────────────────────────────────────────────────

test('createClient returns an object with get/post/put/del/request', () => {
  const client = createClient({
    baseUrl: 'https://api.trivela.network',
    apiKey: 'test-key',
    fetchImpl: okFetch(null),
  });

  assert.equal(typeof client.get, 'function');
  assert.equal(typeof client.post, 'function');
  assert.equal(typeof client.put, 'function');
  assert.equal(typeof client.del, 'function');
  assert.equal(typeof client.request, 'function');
});

// ── Quickstart: create a campaign ──────────────────────────────────────────

test('post /api/v1/campaigns returns the created campaign', async () => {
  const created = { id: 'camp_01', slug: 'my-first-campaign' };
  const client = createClient({
    baseUrl: 'https://api.trivela.network',
    fetchImpl: okFetch(created, 201),
  });

  const campaign = await client.post<{ id: string; slug: string }>(
    '/api/v1/campaigns',
    { name: 'My First Campaign', description: 'test', network: 'TESTNET' },
  );

  assert.equal(campaign.id, 'camp_01');
  assert.equal(campaign.slug, 'my-first-campaign');
});

// ── Quickstart: fetch campaigns ────────────────────────────────────────────

test('get /api/v1/campaigns returns the campaigns array', async () => {
  const payload = {
    campaigns: [
      { id: 'camp_01', name: 'Early Adopters', status: 'active' },
      { id: 'camp_02', name: 'Beta Testers', status: 'draft' },
    ],
  };
  const client = createClient({
    baseUrl: 'https://api.trivela.network',
    fetchImpl: okFetch(payload),
  });

  const { campaigns } = await client.get<{
    campaigns: Array<{ id: string; name: string; status: string }>;
  }>('/api/v1/campaigns');

  assert.equal(campaigns.length, 2);
  assert.equal(campaigns[0].name, 'Early Adopters');
  assert.equal(campaigns[1].status, 'draft');
});

// ── Quickstart: error handling ─────────────────────────────────────────────

test('TrivelaHttpError is thrown on 4xx with status and code', async () => {
  const client = createClient({
    baseUrl: 'https://api.trivela.network',
    fetchImpl: errorFetch(422, { error: 'name is required', code: 'VALIDATION_ERROR' }),
  });

  await assert.rejects(
    () => client.post('/api/v1/campaigns', { name: '' }),
    (err: unknown) => {
      assert.ok(err instanceof TrivelaHttpError);
      assert.equal(err.status, 422);
      assert.equal(err.code, 'VALIDATION_ERROR');
      assert.ok(err.message.includes('name is required'));
      return true;
    },
  );
});

test('apiKey is sent as X-API-Key header', async () => {
  let capturedHeaders: Headers | undefined;
  const client = createClient({
    baseUrl: 'https://api.trivela.network',
    apiKey: 'secret-key',
    fetchImpl: async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers as HeadersInit);
      return new Response(JSON.stringify({}), { status: 200 });
    },
  });

  await client.get('/api/v1/campaigns');
  assert.equal(capturedHeaders?.get('x-api-key'), 'secret-key');
});
