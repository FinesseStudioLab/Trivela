import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebPushService } from './webPushService.js';

function makeRepo(subs = []) {
  const deleted = [];
  return {
    deleted,
    listByUser() {
      return subs;
    },
    deleteByEndpoints(endpoints) {
      deleted.push(...endpoints);
      return endpoints.length;
    },
  };
}

const sub = (endpoint) => ({ endpoint, keys: { p256dh: `p_${endpoint}`, auth: `a_${endpoint}` } });
const VAPID = { publicKey: 'PUB', privateKey: 'PRIV', subject: 'mailto:test@trivela.app' };

test('is a no-op when VAPID is not configured', async () => {
  const service = createWebPushService({ repository: makeRepo([sub('e1')]) });
  assert.equal(service.isConfigured(), false);
  assert.equal(service.getPublicKey(), null);
  assert.deepEqual(await service.sendToUser('alice', { title: 'hi' }), {
    sent: 0,
    pruned: 0,
    skipped: true,
  });
});

test('exposes the VAPID public key when configured', () => {
  const service = createWebPushService({
    repository: makeRepo(),
    vapid: VAPID,
    sender: async () => {},
  });
  assert.equal(service.isConfigured(), true);
  assert.equal(service.getPublicKey(), 'PUB');
});

test('sends a notification to every subscribed device', async () => {
  const calls = [];
  const repo = makeRepo([sub('e1'), sub('e2')]);
  const service = createWebPushService({
    repository: repo,
    vapid: VAPID,
    sender: async (subscription, payload) =>
      calls.push({ endpoint: subscription.endpoint, payload }),
  });

  const result = await service.sendToUser('alice', { title: 'Claim ready' });

  assert.deepEqual(result, { sent: 2, pruned: 0 });
  assert.deepEqual(
    calls.map((c) => c.endpoint),
    ['e1', 'e2'],
  );
  assert.equal(calls[0].payload, JSON.stringify({ title: 'Claim ready' }));
});

test('prunes subscriptions the push service reports as gone (410/404)', async () => {
  const repo = makeRepo([sub('live'), sub('gone-410'), sub('gone-404')]);
  const service = createWebPushService({
    repository: repo,
    vapid: VAPID,
    sender: async (subscription) => {
      if (subscription.endpoint === 'gone-410') throw { statusCode: 410 };
      if (subscription.endpoint === 'gone-404') throw { statusCode: 404 };
    },
  });

  const result = await service.sendToUser('alice', { title: 'hi' });

  assert.deepEqual(result, { sent: 1, pruned: 2 });
  assert.deepEqual(repo.deleted, ['gone-410', 'gone-404']);
});

test('a transient send error does not prune or abort the fan-out', async () => {
  const repo = makeRepo([sub('e1'), sub('e2')]);
  const service = createWebPushService({
    repository: repo,
    vapid: VAPID,
    logger: { error() {} },
    sender: async (subscription) => {
      if (subscription.endpoint === 'e1') throw { statusCode: 500 };
    },
  });

  const result = await service.sendToUser('alice', { title: 'hi' });

  assert.deepEqual(result, { sent: 1, pruned: 0 });
  assert.deepEqual(repo.deleted, [], 'a 500 is not treated as a dead subscription');
});
