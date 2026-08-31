import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import WebSocketServer from './server.js';

describe('WebSocket Server', () => {
  let httpServer;
  let wsServer;
  let wsUrl;

  before(async () => {
    // Create HTTP server
    httpServer = createServer();
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        wsUrl = `ws://localhost:${address.port}/ws`;
        resolve();
      });
    });

    // Create WebSocket server
    wsServer = new WebSocketServer(httpServer, { path: '/ws' });
  });

  after(() => {
    wsServer.close();
    httpServer.close();
  });

  it('should accept client connections', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    assert.strictEqual(ws.readyState, WebSocket.OPEN);
    ws.close();
  });

  it('should send connected message on connection', async () => {
    const ws = new WebSocket(wsUrl);

    const message = await new Promise((resolve, reject) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
      ws.on('error', reject);
    });

    assert.strictEqual(message.type, 'connected');
    assert.ok(message.clientId);
    assert.ok(message.timestamp);
    ws.close();
  });

  it('should handle subscription requests', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve) => ws.on('open', resolve));

    // Skip connected message
    await new Promise((resolve) => ws.once('message', resolve));

    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channel: 'campaigns',
      }),
    );

    const message = await new Promise((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    assert.strictEqual(message.type, 'subscribed');
    assert.strictEqual(message.channel, 'campaigns');
    ws.close();
  });

  it('should handle unsubscription requests', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve) => ws.on('open', resolve));

    // Skip connected message
    await new Promise((resolve) => ws.once('message', resolve));

    // Subscribe first
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channel: 'campaigns',
      }),
    );

    await new Promise((resolve) => ws.once('message', resolve));

    // Unsubscribe
    ws.send(
      JSON.stringify({
        type: 'unsubscribe',
        channel: 'campaigns',
      }),
    );

    const message = await new Promise((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    assert.strictEqual(message.type, 'unsubscribed');
    assert.strictEqual(message.channel, 'campaigns');
    ws.close();
  });

  it('should respond to ping with pong', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve) => ws.on('open', resolve));

    // Skip connected message
    await new Promise((resolve) => ws.once('message', resolve));

    ws.send(JSON.stringify({ type: 'ping' }));

    const message = await new Promise((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    assert.strictEqual(message.type, 'pong');
    assert.ok(message.timestamp);
    ws.close();
  });

  it('should broadcast messages to subscribed clients', async () => {
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((resolve) => ws1.on('open', resolve)),
      new Promise((resolve) => ws2.on('open', resolve)),
    ]);

    // Skip connected messages
    await Promise.all([
      new Promise((resolve) => ws1.once('message', resolve)),
      new Promise((resolve) => ws2.once('message', resolve)),
    ]);

    // Subscribe both clients
    ws1.send(JSON.stringify({ type: 'subscribe', channel: 'test-room' }));
    ws2.send(JSON.stringify({ type: 'subscribe', channel: 'test-room' }));

    // Wait for subscribed confirmations
    await Promise.all([
      new Promise((resolve) => ws1.once('message', resolve)),
      new Promise((resolve) => ws2.once('message', resolve)),
    ]);

    // Broadcast a message
    const testMessage = { type: 'test', data: 'hello' };
    const sentCount = wsServer.broadcast('test-room', testMessage);

    assert.strictEqual(sentCount, 2);

    // Both clients should receive the broadcast
    const [msg1, msg2] = await Promise.all([
      new Promise((resolve) => ws1.once('message', (data) => resolve(JSON.parse(data.toString())))),
      new Promise((resolve) => ws2.once('message', (data) => resolve(JSON.parse(data.toString())))),
    ]);

    assert.strictEqual(msg1.type, 'test');
    assert.strictEqual(msg1.data, 'hello');
    assert.strictEqual(msg2.type, 'test');
    assert.strictEqual(msg2.data, 'hello');

    ws1.close();
    ws2.close();
  });

  it('should track connected clients', () => {
    const stats = wsServer.getStats();
    assert.ok(typeof stats.connectedClients === 'number');
    assert.ok(typeof stats.activeRooms === 'number');
    assert.ok(typeof stats.totalSubscriptions === 'number');
  });

  it('should handle campaign updates', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve) => ws.on('open', resolve));

    // Skip connected message
    await new Promise((resolve) => ws.once('message', resolve));

    // Subscribe to campaign
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channel: 'campaigns',
        campaignId: 'test-campaign-123',
      }),
    );

    // Wait for subscription confirmation
    await new Promise((resolve) => ws.once('message', resolve));

    // Trigger campaign update
    wsServer.notifyCampaignUpdate('test-campaign-123', {
      campaign: { id: 'test-campaign-123', name: 'Updated Campaign' },
      changes: ['name'],
    });

    const message = await new Promise((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    assert.strictEqual(message.type, 'campaign_update');
    assert.strictEqual(message.campaignId, 'test-campaign-123');
    assert.ok(message.update);
    ws.close();
  });

  it('should handle reward notifications', async () => {
    const ws = new WebSocket(wsUrl);
    const walletAddress = 'GTEST123';

    await new Promise((resolve) => ws.on('open', resolve));

    // Skip connected message
    await new Promise((resolve) => ws.once('message', resolve));

    // Subscribe to wallet rewards
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channel: 'rewards',
        walletAddress,
      }),
    );

    // Wait for subscription confirmation
    await new Promise((resolve) => ws.once('message', resolve));

    // Trigger reward credit notification
    wsServer.notifyRewardCredited(walletAddress, 100, 'campaign-123');

    const message = await new Promise((resolve) => {
      ws.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    assert.strictEqual(message.type, 'reward_credited');
    assert.strictEqual(message.walletAddress, walletAddress);
    assert.strictEqual(message.amount, 100);
    assert.strictEqual(message.campaignId, 'campaign-123');
    ws.close();
  });
});
