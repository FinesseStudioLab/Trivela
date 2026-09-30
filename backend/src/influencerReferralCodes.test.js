import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createApp } from './index.js';
import { runMigrations } from './db/migrate.js';
import {
  createInfluencerReferralRepository,
  createInfluencerReferralService,
  InfluencerCodeError,
  normalizeHandle,
  slugifyHandle,
} from './services/influencerReferralCodes.js';

async function makeService() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return createInfluencerReferralService({
    repository: createInfluencerReferralRepository({ db }),
    baseUrl: 'https://trivela.network/',
  });
}

test('normalizeHandle and slugifyHandle', () => {
  assert.equal(normalizeHandle('@Some_Name'), 'Some_Name');
  assert.equal(normalizeHandle('bad handle'), null);
  assert.equal(normalizeHandle(''), null);
  assert.equal(normalizeHandle(42), null);
  assert.equal(slugifyHandle('Some_Name'), 'some-name');
  assert.equal(slugifyHandle('___'), '');
});

test('generate builds ref URL and de-duplicates codes', async () => {
  const service = await makeService();
  const first = service.generate({ handle: '@Some_Name' });
  assert.equal(first.code, 'some-name');
  assert.equal(first.referralUrl, 'https://trivela.network/ref/some-name');
  assert.equal(first.active, true);
  assert.equal(service.generate({ handle: 'some_name', campaignId: 3 }).code, 'some-name-2');
  assert.equal(service.generate({ handle: 'Some_Name' }).code, 'some-name-3');
  assert.equal(service.list().length, 3);
});

test('generate rejects invalid input', async () => {
  const service = await makeService();
  for (const input of [{ handle: 'no spaces' }, { handle: '___' }, { handle: 'ok', campaignId: 'x' }]) {
    assert.throws(() => service.generate(input), (e) => e instanceof InfluencerCodeError && e.status === 400);
  }
});

test('resolve counts clicks and hides inactive/unknown codes', async () => {
  const service = await makeService();
  service.generate({ handle: 'alice' });
  assert.equal(service.resolve('alice').clickCount, 1);
  assert.equal(service.resolve('alice').clickCount, 2);
  assert.equal(service.resolve('Bad Code!'), null);
  assert.equal(service.resolve('nobody'), null);
  service.setActive('alice', false);
  assert.equal(service.resolve('alice'), null);
  assert.equal(service.list()[0].clickCount, 2);
  assert.throws(() => service.setActive('nobody', true), (e) => e.status === 404);
});

test('HTTP: auth required to generate, public to resolve', async () => {
  const app = await createApp({
    dbPath: ':memory:',
    apiKey: 'test-key',
    rateLimit: { windowMs: 60_000, maxRequests: 1000 },
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/referral-codes`;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const denied = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ handle: 'bob' }) });
    assert.equal(denied.status, 401);

    const authed = { ...headers, 'x-api-key': 'test-key' };
    const created = await fetch(base, { method: 'POST', headers: authed, body: JSON.stringify({ handle: '@bob' }) });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).code, 'bob');

    const bad = await fetch(base, { method: 'POST', headers: authed, body: JSON.stringify({ handle: 'a b' }) });
    assert.equal(bad.status, 400);

    const resolved = await fetch(`${base}/bob`);
    assert.equal(resolved.status, 200);
    assert.equal((await resolved.json()).influencerHandle, 'bob');
    assert.equal((await fetch(`${base}/missing`)).status, 404);

    const list = await (await fetch(base, { headers: authed })).json();
    assert.equal(list.data[0].clickCount, 1);

    const patched = await fetch(`${base}/bob`, { method: 'PATCH', headers: authed, body: JSON.stringify({ active: false }) });
    assert.equal(patched.status, 200);
    assert.equal((await fetch(`${base}/bob`)).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
