// Live activity feed (#1201): indexer -> WebSocket `activity` room.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import WebSocketServer, { ACTIVITY_ROOM, maskWallet } from './server.js';
import { emitActivity } from '../jobs/eventIndexer.js';

const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

function nextMessage(ws, type) {
  return new Promise((resolve) => {
    const onMessage = (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === type) {
        ws.off('message', onMessage);
        resolve(data);
      }
    };
    ws.on('message', onMessage);
  });
}

describe('maskWallet', () => {
  it('masks long addresses and leaves short values alone', () => {
    assert.strictEqual(maskWallet(WALLET), 'GABC…TUVW');
    assert.strictEqual(maskWallet('short'), 'short');
    assert.strictEqual(maskWallet(null), '');
  });
});

describe('emitActivity', () => {
  it('maps claim events to activity payloads', () => {
    const seen = [];
    emitActivity((a) => seen.push(a), 'claim', {
      topic: ['claim', WALLET, 'camp-1'],
      data: 50000000n,
      ledger: 42,
      txHash: 'abc',
    });
    assert.deepStrictEqual(seen, [
      { kind: 'claim', wallet: WALLET, campaignId: 'camp-1', amount: '50000000', ledger: 42, txHash: 'abc' },
    ]);
  });

  it('omits amount for registrations and skips events without a wallet', () => {
    const seen = [];
    emitActivity((a) => seen.push(a), 'registration', { topic: ['register', WALLET, 7] });
    emitActivity((a) => seen.push(a), 'registration', { topic: ['register'] });
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].amount, null);
    assert.strictEqual(seen[0].campaignId, '7');
  });

  it('is a no-op without a callback and never throws from the callback', () => {
    emitActivity(undefined, 'claim', { topic: ['claim', WALLET] });
    emitActivity(
      () => {
        throw new Error('boom');
      },
      'claim',
      { topic: ['claim', WALLET] },
      { warn() {} },
    );
  });
});

describe('WebSocketServer.publishActivity', () => {
  let httpServer;
  let wsServer;
  let wsUrl;

  before(async () => {
    httpServer = createServer();
    await new Promise((resolve) => httpServer.listen(0, resolve));
    wsUrl = `ws://localhost:${httpServer.address().port}/ws`;
    wsServer = new WebSocketServer(httpServer, { path: '/ws' });
  });

  after(() => {
    wsServer.close();
    httpServer.close();
  });

  it('broadcasts masked activity to `activity` subscribers', async () => {
    const ws = new WebSocket(wsUrl);
    await nextMessage(ws, 'connected');
    ws.send(JSON.stringify({ type: 'subscribe', channel: ACTIVITY_ROOM }));
    await nextMessage(ws, 'subscribed');

    const received = nextMessage(ws, 'activity');
    const sent = wsServer.publishActivity({
      kind: 'claim',
      wallet: WALLET,
      campaignId: 'camp-1',
      amount: '10',
      txHash: 'tx1',
    });
    const msg = await received;
    assert.strictEqual(sent, 1);
    assert.strictEqual(msg.kind, 'claim');
    assert.strictEqual(msg.wallet, 'GABC…TUVW');
    assert.strictEqual(msg.id, 'claim:tx1');
    assert.ok(!JSON.stringify(msg).includes(WALLET), 'full wallet must not be broadcast');
    ws.close();
  });

  it('ignores unknown kinds', () => {
    assert.strictEqual(wsServer.publishActivity({ kind: 'transfer', wallet: WALLET }), 0);
    assert.strictEqual(wsServer.publishActivity(null), 0);
  });
});
