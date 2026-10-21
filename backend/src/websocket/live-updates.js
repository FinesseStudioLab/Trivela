/**
 * WebSocket Live Updates Service
 * 
 * Hardened websocket layer for pushing indexer-derived updates with backpressure,
 * reconnection, and topic-based subscriptions.
 * 
 * Fixes: https://github.com/FinesseStudioLab/Trivela/issues/859
 */

import { WebSocketServer } from 'ws';
import pino from 'pino';
import { EventEmitter } from 'events';

const logger = pino({ name: 'live-updates' });

export class LiveUpdatesService extends EventEmitter {
  constructor({ server, maxConnections = 10000, heartbeatIntervalMs = 30000, maxBackpressure = 100 }) {
    super();
    this.wss = new WebSocketServer({ server, maxPayload: 1024 * 100 }); // 100KB max
    this.maxConnections = maxConnections;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.maxBackpressure = maxBackpressure;
    this.connections = new Map(); // socket -> { topics, ip, isAlive, queueSize }
    this.ipConnections = new Map(); // ip -> count
    this.heartbeatInterval = null;
  }

  /**
   * Initialize WebSocket server
   */
  initialize() {
    this.wss.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      
      // Enforce per-IP connection limits
      const ipCount = this.ipConnections.get(ip) || 0;
      if (ipCount >= 100) {
        logger.warn({ ip }, 'Connection limit exceeded for IP');
        ws.close(1008, 'Too many connections from this IP');
        return;
      }
      
      // Enforce global connection limit
      if (this.connections.size >= this.maxConnections) {
        logger.warn({ ip }, 'Global connection limit exceeded');
        ws.close(1008, 'Server at capacity');
        return;
      }
      
      const clientId = this._generateClientId();
      this.connections.set(ws, {
        id: clientId,
        topics: new Set(),
        ip,
        isAlive: true,
        queueSize: 0,
        connectedAt: Date.now()
      });
      
      this.ipConnections.set(ip, ipCount + 1);
      
      logger.info({ clientId, ip, totalConnections: this.connections.size }, 'Client connected');
      
      ws.on('message', (message) => this._handleMessage(ws, message));
      ws.on('pong', () => this._handlePong(ws));
      ws.on('close', () => this._handleClose(ws));
      ws.on('error', (error) => this._handleError(ws, error));
      
      // Send welcome message
      this._send(ws, { type: 'welcome', clientId, serverTime: Date.now() });
    });
    
    // Start heartbeat
    this.heartbeatInterval = setInterval(() => this._heartbeat(), this.heartbeatIntervalMs);
    
    logger.info({ maxConnections: this.maxConnections }, 'WebSocket server initialized');
  }

  /**
   * Shutdown server
   */
  async shutdown() {
    clearInterval(this.heartbeatInterval);
    
    for (const ws of this.connections.keys()) {
      ws.close(1001, 'Server shutting down');
    }
    
    this.wss.close();
    logger.info('WebSocket server shut down');
  }

  /**
   * Handle incoming client messages
   */
  _handleMessage(ws, message) {
    const client = this.connections.get(ws);
    if (!client) return;
    
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'subscribe':
          this._subscribe(ws, data.topics);
          break;
        case 'unsubscribe':
          this._unsubscribe(ws, data.topics);
          break;
        case 'ping':
          this._send(ws, { type: 'pong', timestamp: Date.now() });
          break;
        default:
          logger.warn({ type: data.type, clientId: client.id }, 'Unknown message type');
      }
    } catch (error) {
      logger.error({ error: error.message, clientId: client.id }, 'Error handling message');
      this._send(ws, { type: 'error', error: 'Invalid message format' });
    }
  }

  /**
   * Subscribe client to topics
   */
  _subscribe(ws, topics) {
    const client = this.connections.get(ws);
    if (!client) return;
    
    const topicsArray = Array.isArray(topics) ? topics : [topics];
    
    for (const topic of topicsArray) {
      if (typeof topic === 'string' && topic.length > 0 && topic.length < 100) {
        client.topics.add(topic);
      }
    }
    
    logger.info({ clientId: client.id, topics: Array.from(client.topics) }, 'Client subscribed to topics');
    this._send(ws, { type: 'subscribed', topics: Array.from(client.topics) });
  }

  /**
   * Unsubscribe client from topics
   */
  _unsubscribe(ws, topics) {
    const client = this.connections.get(ws);
    if (!client) return;
    
    const topicsArray = Array.isArray(topics) ? topics : [topics];
    
    for (const topic of topicsArray) {
      client.topics.delete(topic);
    }
    
    logger.info({ clientId: client.id, topics: Array.from(client.topics) }, 'Client unsubscribed from topics');
    this._send(ws, { type: 'unsubscribed', topics: topicsArray });
  }

  /**
   * Broadcast event to subscribed clients
   */
  broadcast(topic, data) {
    let sentCount = 0;
    let droppedCount = 0;
    
    for (const [ws, client] of this.connections.entries()) {
      if (client.topics.has(topic)) {
        // Check backpressure
        if (client.queueSize >= this.maxBackpressure) {
          droppedCount++;
          logger.warn({ clientId: client.id, queueSize: client.queueSize }, 'Backpressure limit reached, dropping message');
          continue;
        }
        
        const success = this._send(ws, {
          type: 'event',
          topic,
          data,
          timestamp: Date.now()
        });
        
        if (success) {
          sentCount++;
        }
      }
    }
    
    if (sentCount > 0 || droppedCount > 0) {
      logger.debug({ topic, sentCount, droppedCount }, 'Broadcast complete');
    }
  }

  /**
   * Send message with backpressure tracking
   */
  _send(ws, data) {
    const client = this.connections.get(ws);
    if (!client) return false;
    
    if (ws.readyState !== ws.OPEN) {
      return false;
    }
    
    try {
      const message = JSON.stringify(data);
      
      // Track buffered amount for backpressure
      const bufferedBefore = ws.bufferedAmount;
      ws.send(message);
      const bufferedAfter = ws.bufferedAmount;
      
      client.queueSize = Math.floor(bufferedAfter / 1024); // KB
      
      return true;
    } catch (error) {
      logger.error({ error: error.message, clientId: client.id }, 'Error sending message');
      return false;
    }
  }

  /**
   * Heartbeat to detect dead connections
   */
  _heartbeat() {
    const now = Date.now();
    
    for (const [ws, client] of this.connections.entries()) {
      if (!client.isAlive) {
        logger.info({ clientId: client.id }, 'Client failed heartbeat, terminating');
        ws.terminate();
        continue;
      }
      
      client.isAlive = false;
      ws.ping();
    }
  }

  /**
   * Handle pong response
   */
  _handlePong(ws) {
    const client = this.connections.get(ws);
    if (client) {
      client.isAlive = true;
    }
  }

  /**
   * Handle connection close
   */
  _handleClose(ws) {
    const client = this.connections.get(ws);
    if (!client) return;
    
    // Update IP connection count
    const ipCount = this.ipConnections.get(client.ip) || 1;
    if (ipCount <= 1) {
      this.ipConnections.delete(client.ip);
    } else {
      this.ipConnections.set(client.ip, ipCount - 1);
    }
    
    this.connections.delete(ws);
    
    logger.info({ clientId: client.id, ip: client.ip, totalConnections: this.connections.size }, 'Client disconnected');
  }

  /**
   * Handle connection error
   */
  _handleError(ws, error) {
    const client = this.connections.get(ws);
    logger.error({ error: error.message, clientId: client?.id }, 'WebSocket error');
  }

  /**
   * Generate unique client ID
   */
  _generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get server stats
   */
  getStats() {
    const topicCounts = new Map();
    
    for (const client of this.connections.values()) {
      for (const topic of client.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
    
    return {
      totalConnections: this.connections.size,
      uniqueIPs: this.ipConnections.size,
      topicSubscriptions: Object.fromEntries(topicCounts)
    };
  }
}
