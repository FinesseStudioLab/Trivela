import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import WebSocketServer from './server.js';
import {
  createLeaderboardGateway,
  diffLeaderboards,
  leaderboardRoom,
} from './leaderboardGateway.js';

const W = (n) =>
  `G${String(n).padStart(3, '0')}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
const entry = (wallet, rank, points) => ({ wallet, rank, points });

test('diffLeaderboards labels new, up, down and points-only changes; omits unchanged', () => {
  const previous = [entry('a', 1, 5), entry('b', 2, 4), entry('c', 3, 3), entry('d', 4, 1)];
  const next = [entry('b', 1, 6), entry('a', 2, 5), entry('c', 3, 3), entry('e', 4, 1)];

  const byWallet = Object.fromEntries(diffLeaderboards(previous, next).map((c) => [c.wallet, c]));

  assert.equal(byWallet.b.change, 'up');
  assert.deepEqual([byWallet.b.previousRank, byWallet.b.previousPoints], [2, 4]);
  assert.equal(byWallet.a.change, 'down');
  assert.equal(byWallet.e.change, 'new');
  assert.equal(byWallet.e.previousRank, null);
  assert.equal(byWallet.c, undefined, 'c is unchanged');
  assert.equal(byWallet.d, undefined, 'd dropped out; only current entries are reported');
});

test('a points change at the same rank is reported as same', () => {
  const [c] = diffLeaderboards([entry('a', 1, 5)], [entry('a', 1, 7)]);
  assert.equal(c.change, 'same');
  assert.equal(c.previousPoints, 5);
});

function makeGateway(initial) {
  let board = initial;
  const published = [];
  const gateway = createLeaderboardGateway({
    getLeaderboard: () => board,
    publish: (campaignId, message) => {
      published.push({ campaignId, message });
      return 1;
    },
    debounceMs: 0,
    logger: {},
  });
  return { gateway, published, set: (b) => (board = b) };
}

test('publishes only when the ranking changed, with masked wallets', () => {
  const { gateway, published, set } = makeGateway([entry(W(1), 1, 3)]);
  gateway.snapshot('9');

  assert.equal(gateway.trigger('9'), 0, 'nothing changed since the snapshot');
  assert.equal(published.length, 0);

  set([entry(W(2), 1, 4), entry(W(1), 2, 3)]);
  assert.equal(gateway.trigger('9'), 1);

  const { campaignId, message } = published[0];
  assert.equal(campaignId, '9');
  assert.equal(message.type, 'leaderboard_update');
  assert.ok(
    message.entries.every((e) => e.wallet.includes('…')),
    'wallets are masked',
  );
  assert.ok(!JSON.stringify(message).includes(W(2)), 'no full wallet leaves the server');
  assert.deepEqual(message.changes.map((c) => c.change).sort(), ['down', 'new']);

  assert.equal(gateway.trigger('9'), 0, 'a repeat trigger with no change is silent');
});

test('bursts within the debounce window produce one publish', async () => {
  let board = [entry('a', 1, 1)];
  const published = [];
  const gateway = createLeaderboardGateway({
    getLeaderboard: () => board,
    publish: (id, m) => (published.push(m), 1),
    debounceMs: 20,
    logger: {},
  });
  gateway.snapshot('1');
  board = [entry('a', 1, 2)];
  gateway.trigger('1');
  board = [entry('a', 1, 3)];
  gateway.trigger('1');
  gateway.trigger('1');

  await new Promise((r) => setTimeout(r, 60));

  assert.equal(published.length, 1);
  assert.equal(published[0].entries[0].points, 3, 'the publish reflects the latest state');
  gateway.stop();
});

test('honours the limit and survives a failing data source', () => {
  const many = Array.from({ length: 30 }, (_, i) => entry(`w${i}`, i + 1, 100 - i));
  const { gateway } = makeGateway(many);
  assert.equal(gateway.snapshot('1').entries.length, 10);

  const broken = createLeaderboardGateway({
    getLeaderboard: () => {
      throw new Error('db gone');
    },
    publish: () => 1,
    debounceMs: 0,
    logger: {},
  });
  assert.equal(broken.trigger('1'), 0);
});

test('end to end: subscribers get a snapshot, then live updates when points are awarded', async () => {
  let board = [entry(W(1), 1, 2)];
  /** @type {WebSocketServer} */
  let wsServer;
  const gateway = createLeaderboardGateway({
    getLeaderboard: () => board,
    publish: (id, message) => wsServer.broadcast(leaderboardRoom(id), message),
    debounceMs: 0,
    logger: {},
  });

  const http = createServer();
  wsServer = new WebSocketServer(http, {
    path: '/ws',
    leaderboardSnapshot: (id) => gateway.snapshot(id),
  });
  http.listen(0);
  await once(http, 'listening');
  const { port } = http.address();

  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = [];
  client.on('message', (m) => messages.push(JSON.parse(m.toString())));
  await once(client, 'open');
  const waitFor = async (type) => {
    for (let i = 0; i < 100; i++) {
      const found = messages.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${type} message; got ${messages.map((m) => m.type)}`);
  };

  client.send(JSON.stringify({ type: 'subscribe', channel: 'leaderboard', campaignId: '5' }));
  const snapshot = await waitFor('leaderboard_snapshot');
  assert.equal(snapshot.campaignId, '5');
  assert.equal(snapshot.entries.length, 1);

  board = [entry(W(2), 1, 9), entry(W(1), 2, 2)];
  gateway.trigger('5');
  const update = await waitFor('leaderboard_update');
  assert.equal(update.entries[0].points, 9);
  assert.equal(update.changes.find((c) => c.change === 'new').rank, 1);

  // A client subscribed to a different campaign hears nothing.
  assert.equal(wsServer.broadcast(leaderboardRoom('other'), { type: 'x' }), 0);

  client.close();
  wsServer.close();
  http.close();
});
