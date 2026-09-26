import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import request from 'supertest';
import { runMigrations } from '../db/migrate.js';
import { createApp } from '../index.js';
import {
  assertPublicHttpsUrl,
  canonicalJson,
  createIpfsPinService,
  createPinataProvider,
} from './ipfsPinService.js';

const silent = { info() {}, warn() {} };

function fakeProvider() {
  const calls = [];
  let n = 0;
  return {
    name: 'fake',
    calls,
    async pinJson(content, { name }) {
      calls.push({ type: 'json', name, content });
      return { cid: `bafyjson${++n}`, size: JSON.stringify(content).length };
    },
    async pinFile(buffer, { name, mimeType }) {
      calls.push({ type: 'file', name, mimeType, bytes: buffer.length });
      return { cid: `bafyfile${++n}`, size: buffer.length };
    },
  };
}

function imageFetch({
  status = 200,
  type = 'image/png',
  body = Buffer.from('PNGDATA'),
  length,
} = {}) {
  return async () => ({
    ok: status < 400,
    status,
    headers: {
      get: (h) => ({ 'content-type': type, 'content-length': length })[h.toLowerCase()] ?? null,
    },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  });
}

async function makeService(over = {}) {
  const db = new Database(':memory:');
  await runMigrations(db);
  const provider = over.provider ?? fakeProvider();
  const service = createIpfsPinService({
    db,
    provider,
    fetchImpl: over.fetchImpl ?? imageFetch(),
    logger: silent,
    sleep: async () => {},
    ...over.options,
  });
  return { db, provider, service };
}

const campaign = {
  id: 7,
  name: 'Spring Drop',
  description: 'Win points',
  imageUrl: 'https://cdn.example.com/a.png',
  category: 'DeFi',
  tags: ['x'],
  rewardPerAction: 5,
};

test('canonicalJson is order-independent and skips undefined', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
});

test('assertPublicHttpsUrl blocks non-https and internal hosts', () => {
  assert.equal(assertPublicHttpsUrl('https://cdn.example.com/a.png').hostname, 'cdn.example.com');
  for (const bad of [
    'http://cdn.example.com/a.png',
    'https://localhost/a.png',
    'https://127.0.0.1/a.png',
    'https://10.0.0.5/a.png',
    'https://192.168.1.1/a.png',
    'https://172.20.0.1/a.png',
    'https://169.254.169.254/latest',
    'https://[::1]/a.png',
    'https://db.internal/a.png',
    'file:///etc/passwd',
    'not a url',
  ]) {
    assert.throws(() => assertPublicHttpsUrl(bad), undefined, bad);
  }
});

test('pinCampaign pins image, rules, badge and a metadata document linking them', async () => {
  const { service, provider } = await makeService();

  const result = await service.pinCampaign(campaign);

  assert.deepEqual(
    result.pins.map((p) => p.kind),
    ['image', 'rules', 'badge', 'metadata'],
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.metadataUri, `ipfs://${result.metadataCid}`);

  const metadata = provider.calls.find((c) => c.name.endsWith('metadata.json')).content;
  assert.equal(metadata.image, `ipfs://${result.pins[0].cid}`);
  assert.equal(metadata.rules, `ipfs://${result.pins[1].cid}`);
  assert.equal(metadata.badge, `ipfs://${result.pins[2].cid}`);
  assert.equal(metadata.name, 'Spring Drop');

  assert.equal(service.list(7).length, 4);
});

test('re-pinning unchanged content is served from the store, not the provider', async () => {
  const { service, provider } = await makeService();
  await service.pinCampaign(campaign);
  const callsAfterFirst = provider.calls.length;

  const again = await service.pinCampaign(campaign);

  assert.equal(provider.calls.length, callsAfterFirst);
  assert.ok(again.pins.every((p) => p.cached));

  // Changed content pins again.
  await service.pinCampaign({ ...campaign, description: 'New copy' });
  assert.ok(provider.calls.length > callsAfterFirst);
});

test('an image failure is reported but the JSON documents still pin', async () => {
  const { service } = await makeService({ fetchImpl: imageFetch({ type: 'text/html' }) });
  const result = await service.pinCampaign(campaign);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /non-image/);
  assert.deepEqual(
    result.pins.map((p) => p.kind),
    ['rules', 'badge', 'metadata'],
  );
});

test('oversized images are refused', async () => {
  const { service } = await makeService({
    fetchImpl: imageFetch({ length: '999999999' }),
    options: { maxImageBytes: 1024 },
  });
  await assert.rejects(() => service.pinImage(7, 'https://cdn.example.com/big.png'), /exceeds/);
});

test('transient provider errors are retried with backoff; permanent ones are not', async () => {
  let calls = 0;
  const flaky = {
    name: 'flaky',
    async pinJson() {
      calls++;
      if (calls < 3) throw Object.assign(new Error('rate limited'), { status: 429 });
      return { cid: 'bafyok', size: 1 };
    },
    async pinFile() {
      return { cid: 'x', size: 1 };
    },
  };
  const { service } = await makeService({ provider: flaky });
  const pin = await service.pinJsonDocument(1, 'rules', { a: 1 });
  assert.equal(pin.cid, 'bafyok');
  assert.equal(calls, 3);

  let permanent = 0;
  const rejecting = {
    name: 'reject',
    async pinJson() {
      permanent++;
      throw Object.assign(new Error('unauthorized'), { status: 401 });
    },
    async pinFile() {},
  };
  const { service: s2 } = await makeService({ provider: rejecting });
  await assert.rejects(() => s2.pinJsonDocument(1, 'rules', { a: 1 }), /unauthorized/);
  assert.equal(permanent, 1);
});

test('createPinataProvider sends the JWT and maps the response', async () => {
  const seen = [];
  const provider = createPinataProvider({
    jwt: 'jwt-123',
    baseUrl: 'https://pinata.test/',
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ IpfsHash: 'QmABC', PinSize: 42 }) };
    },
  });

  const result = await provider.pinJson({ hello: 'world' }, { name: 'doc.json' });

  assert.deepEqual(result, { cid: 'QmABC', size: 42 });
  assert.equal(seen[0].url, 'https://pinata.test/pinning/pinJSONToIPFS');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer jwt-123');
  assert.deepEqual(JSON.parse(seen[0].init.body).pinataContent, { hello: 'world' });
  assert.throws(() => createPinataProvider({ jwt: '' }), /PINATA_JWT/);

  const failing = createPinataProvider({
    jwt: 'j',
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'down' }),
  });
  await assert.rejects(
    () => failing.pinJson({}, { name: 'x' }),
    (e) => e.status === 503,
  );
});

test('routes: pin on demand, list pins, 503 when unconfigured, 404 for unknown campaigns', async () => {
  const { db, provider } = await makeService();
  const app = await createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    rateLimit: { windowMs: 60_000, maxRequests: 10_000 },
    apiKeys: 'k',
    ipfsPinService: createIpfsPinService({
      db,
      provider,
      fetchImpl: imageFetch(),
      logger: silent,
      sleep: async () => {},
    }),
  });
  const created = await request(app)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'k')
    .send({ name: 'Pin Me', rewardPerAction: 1 })
    .expect(201);

  const pinned = await request(app)
    .post(`/api/v1/campaigns/${created.body.id}/ipfs-pins`)
    .set('X-API-Key', 'k')
    .expect(201);
  assert.match(pinned.body.metadataUri, /^ipfs:\/\//);
  const list = await request(app)
    .get(`/api/v1/campaigns/${created.body.id}/ipfs-pins`)
    .set('X-API-Key', 'k')
    .expect(200);
  assert.equal(list.body.configured, true);
  assert.ok(list.body.total >= 3);

  await request(app).post('/api/v1/campaigns/nope/ipfs-pins').set('X-API-Key', 'k').expect(404);
  await request(app).post(`/api/v1/campaigns/${created.body.id}/ipfs-pins`).expect(401);

  const bare = await createApp({
    dbPath: ':memory:',
    campaigns: [],
    disableJobs: true,
    skipEnvValidation: true,
    rateLimit: { windowMs: 60_000, maxRequests: 10_000 },
    apiKeys: 'k',
  });
  const c2 = await request(bare)
    .post('/api/v1/campaigns')
    .set('X-API-Key', 'k')
    .send({ name: 'No Pins', rewardPerAction: 1 })
    .expect(201);
  const off = await request(bare)
    .post(`/api/v1/campaigns/${c2.body.id}/ipfs-pins`)
    .set('X-API-Key', 'k')
    .expect(503);
  assert.equal(off.body.code, 'IPFS_PIN_NOT_CONFIGURED');
});
