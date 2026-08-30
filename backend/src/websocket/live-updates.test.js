/**
 * Tests for WebSocket Live Updates Service
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'http';
import WebSocket from 'ws';
import { LiveUpdatesService } from './live-updates.js';

describe('LiveUpdatesService', () => {
  let service;
  let httpServer;
  const PORT = 9876;

  before(async () => {
    httpServer = createServer();
    await new Promise(resolve => httpServer.listen(PORT, resolve));
    
    service = new LiveUpdatesService({
      server: httpServer,
      maxConnections: 100,
      heartbeatIntervalMs: 5000,
      maxBackpressure: 50
    });
    
    service.initialize();
  });

  after(async () => {
    await service.shutdown();
    httpServer.close();
  });

  describe('connection handling', () => {
    it('should accept valid connections', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      // Wait for welcome message
      const message = await new Promise((resolve) => {
        ws.on('message', (data) => resolve(JSON.parse(data.toString())));
      });
      
      assert.strictEqual(message.type, 'welcome', 'Should receive welcome message');
      assert.ok(message.clientId, 'Should have client ID');
      
      ws.close();
      
      // Wait for disconnect
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should enforce per-IP connection limits', async () => {
      const connections = [];
      
      // Create 100 connections (the per-IP limit)
      for (let i = 0; i < 100; i++) {
        const ws = new WebSocket(`ws://localhost:${PORT}`);
        connections.push(ws);
        await new Promise(resolve => ws.on('open', resolve));
      }
      
      // 101st connection should be rejected
      const extraWs = new WebSocket(`ws://localhost:${PORT}`);
      
      const closeCode = await new Promise((resolve) => {
        extraWs.on('close', (code) => resolve(code));
      });
      
      assert.strictEqual(closeCode, 1008, 'Should reject connection with policy violation code');
      
      // Cleanup
      for (const ws of connections) {
        ws.close();
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle connection close gracefully', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise(resolve => ws.on('open', resolve));
      
      const initialCount = service.connections.size;
      
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      assert.strictEqual(service.connections.size, initialCount - 1, 'Should remove connection from tracking');
    });
  });

  describe('topic subscriptions', () => {
    it('should subscribe to topics', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise(resolve => ws.on('open', resolve));
      
      // Skip welcome message
      await new Promise(resolve => ws.once('message', resolve));
      
      ws.send(JSON.stringify({ type: 'subscribe', topics: ['balance', 'leaderboard'] }));
      
      const response = await new Promise(resolve => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribed') resolve(msg);
        });
      });
      
      assert.deepStrictEqual(response.topics.sort(), ['balance', 'leaderboard'], 'Should confirm subscription');
      
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should unsubscribe from topics', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise(resolve => ws.on('open', resolve));
      await new Promise(resolve => ws.once('message', resolve)); // welcome
      
      ws.send(JSON.stringify({ type: 'subscribe', topics: ['topic1', 'topic2'] }));
      await new Promise(resolve => ws.once('message', resolve)); // subscribed
      
      ws.send(JSON.stringify({ type: 'unsubscribe', topics: ['topic1'] }));
      
      const response = await new Promise(resolve => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'unsubscribed') resolve(msg);
        });
      });
      
      assert.deepStrictEqual(response.topics, ['topic1'], 'Should confirm unsubscription');
      
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('broadcasting', () => {
    it('should broadcast to subscribed clients only', async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT}`);
      
      await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve))
      ]);
      
      // Skip welcome messages
      await Promise.all([
        new Promise(resolve => ws1.once('message', resolve)),
        new Promise(resolve => ws2.once('message', resolve))
      ]);
      
      // ws1 subscribes to 'test-topic', ws2 doesn't
      ws1.send(JSON.stringify({ type: 'subscribe', topics: ['test-topic'] }));
      await new Promise(resolve => ws1.once('message', resolve)); // subscribed confirmation
      
      // Broadcast
      service.broadcast('test-topic', { value: 42 });
      
      // ws1 should receive, ws2 should not
      const ws1Message = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 1000);
        ws1.on('message', (data) => {
          clearTimeout(timeout);
          resolve(JSON.parse(data.toString()));
        });
      });
      
      assert.strictEqual(ws1Message.type, 'event', 'Should receive event');
      assert.strictEqual(ws1Message.topic, 'test-topic', 'Should have correct topic');
      assert.strictEqual(ws1Message.data.value, 42, 'Should have correct data');
      
      // ws2 should not receive anything
      let ws2Received = false;
      ws2.on('message', () => { ws2Received = true; });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      assert.strictEqual(ws2Received, false, 'ws2 should not receive message');
      
      ws1.close();
      ws2.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle backpressure', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise(resolve => ws.on('open', resolve));
      await new Promise(resolve => ws.once('message', resolve)); // welcome
      
      ws.send(JSON.stringify({ type: 'subscribe', topics: ['backpressure-test'] }));
      await new Promise(resolve => ws.once('message', resolve)); // subscribed
      
      // Pause reading to simulate slow client
      ws.pause();
      
      // Flood with messages
      for (let i = 0; i < 200; i++) {
        service.broadcast('backpressure-test', { index: i, data: 'x'.repeat(1000) });
      }
      
      // Service should have detected backpressure and dropped messages
      const stats = service.getStats();
      assert.ok(stats.totalConnections > 0, 'Connection should still exist');
      
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('heartbeat & reconnection', () => {
    it('should respond to ping messages', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise(resolve => ws.on('open', resolve));
      await new Promise(resolve => ws.once('message', resolve)); // welcome
      
      ws.send(JSON.stringify({ type: 'ping' }));
      
      const response = await new Promise(resolve => {
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'pong') resolve(msg);
        });
      });
      
      assert.strictEqual(response.type, 'pong', 'Should respond with pong');
      assert.ok(response.timestamp, 'Should include timestamp');
      
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should handle pong responses to keep connection alive', async () => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      await new Promise(resolve => ws.on('open', resolve));
      
      // Connection should remain alive when responding to pings
      ws.on('ping', () => ws.pong());
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      assert.strictEqual(ws.readyState, WebSocket.OPEN, 'Connection should remain open');
      
      ws.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('stats', () => {
    it('should return accurate connection stats', async () => {
      const ws1 = new WebSocket(`ws://localhost:${PORT}`);
      const ws2 = new WebSocket(`ws://localhost:${PORT}`);
      
      await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve))
      ]);
      
      await Promise.all([
        new Promise(resolve => ws1.once('message', resolve)),
        new Promise(resolve => ws2.once('message', resolve))
      ]);
      
      ws1.send(JSON.stringify({ type: 'subscribe', topics: ['stats-test'] }));
      ws2.send(JSON.stringify({ type: 'subscribe', topics: ['stats-test', 'other-topic'] }));
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const stats = service.getStats();
      
      assert.ok(stats.totalConnections >= 2, 'Should show at least 2 connections');
      assert.ok(stats.topicSubscriptions['stats-test'] >= 2, 'Should show subscriptions');
      
      ws1.close();
      ws2.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });
});
