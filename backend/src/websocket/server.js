import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { log as logger } from '../middleware/logger.js';

/**
 * WebSocket server for real-time updates
 * Handles: campaign updates, participant changes, reward notifications
 */
class WebSocketServer extends EventEmitter {
  constructor(httpServer, options = {}) {
    super();

    this.wss = new WebSocket.Server({
      server: httpServer,
      path: options.path || '/ws',
      verifyClient: options.verifyClient,
    });

    this.clients = new Map(); // clientId -> { ws, subscriptions, metadata }
    this.rooms = new Map(); // roomId -> Set of clientIds

    this.setupServer();
    logger.info('WebSocket server initialized');
  }

  setupServer() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const metadata = {
        connectedAt: new Date().toISOString(),
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      this.clients.set(clientId, {
        ws,
        subscriptions: new Set(),
        metadata,
      });

      logger.info(`WebSocket client connected: ${clientId}`);

      // Send welcome message
      this.send(clientId, {
        type: 'connected',
        clientId,
        timestamp: new Date().toISOString(),
      });

      ws.on('message', (data) => this.handleMessage(clientId, data));
      ws.on('close', () => this.handleDisconnect(clientId));
      ws.on('error', (error) => this.handleError(clientId, error));

      // Set up ping/pong for connection health
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    // Heartbeat interval to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds

    this.wss.on('close', () => {
      clearInterval(this.heartbeatInterval);
    });
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message);
          break;
        case 'ping':
          this.send(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        default:
          logger.warn(`Unknown message type: ${message.type} from ${clientId}`);
      }
    } catch (error) {
      logger.error(`Error parsing message from ${clientId}:`, error);
      this.send(clientId, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  }

  handleSubscribe(clientId, message) {
    const { channel, campaignId, walletAddress } = message;

    if (!channel) {
      return this.send(clientId, {
        type: 'error',
        message: 'Channel is required for subscription',
      });
    }

    const client = this.clients.get(clientId);
    if (!client) return;

    let roomId = channel;

    // Add specific identifiers to room ID
    if (campaignId) {
      roomId = `${channel}:campaign:${campaignId}`;
    } else if (walletAddress) {
      roomId = `${channel}:wallet:${walletAddress}`;
    }

    client.subscriptions.add(roomId);

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId).add(clientId);

    logger.info(`Client ${clientId} subscribed to ${roomId}`);

    this.send(clientId, {
      type: 'subscribed',
      channel: roomId,
      timestamp: new Date().toISOString(),
    });
  }

  handleUnsubscribe(clientId, message) {
    const { channel } = message;

    if (!channel) return;

    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(channel);

    const room = this.rooms.get(channel);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.rooms.delete(channel);
      }
    }

    logger.info(`Client ${clientId} unsubscribed from ${channel}`);

    this.send(clientId, {
      type: 'unsubscribed',
      channel,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all rooms
    for (const roomId of client.subscriptions) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.delete(clientId);
        if (room.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    }

    this.clients.delete(clientId);
    logger.info(`WebSocket client disconnected: ${clientId}`);
  }

  handleError(clientId, error) {
    logger.error(`WebSocket error for client ${clientId}:`, error);
  }

  /**
   * Send message to a specific client
   */
  send(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error(`Error sending to client ${clientId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast message to all clients in a room
   */
  broadcast(roomId, data, excludeClientId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    let sentCount = 0;
    for (const clientId of room) {
      if (clientId === excludeClientId) continue;
      if (this.send(clientId, data)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Broadcast to all clients in multiple rooms
   */
  broadcastToRooms(roomIds, data) {
    let totalSent = 0;
    for (const roomId of roomIds) {
      totalSent += this.broadcast(roomId, data);
    }
    return totalSent;
  }

  /**
   * Notify about campaign updates
   */
  notifyCampaignUpdate(campaignId, update) {
    const roomId = `campaigns:campaign:${campaignId}`;
    const message = {
      type: 'campaign_update',
      campaignId,
      update,
      timestamp: new Date().toISOString(),
    };

    const sent = this.broadcast(roomId, message);
    logger.info(`Campaign update broadcast to ${sent} clients in ${roomId}`);
  }

  /**
   * Notify about new participant
   */
  notifyNewParticipant(campaignId, participant) {
    const roomId = `campaigns:campaign:${campaignId}`;
    const message = {
      type: 'new_participant',
      campaignId,
      participant,
      timestamp: new Date().toISOString(),
    };

    this.broadcast(roomId, message);
  }

  /**
   * Notify about reward credited
   */
  notifyRewardCredited(walletAddress, amount, campaignId) {
    const walletRoomId = `rewards:wallet:${walletAddress}`;
    const campaignRoomId = `rewards:campaign:${campaignId}`;

    const message = {
      type: 'reward_credited',
      walletAddress,
      amount,
      campaignId,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToRooms([walletRoomId, campaignRoomId], message);
  }

  /**
   * Notify about reward claimed
   */
  notifyRewardClaimed(walletAddress, amount) {
    const roomId = `rewards:wallet:${walletAddress}`;
    const message = {
      type: 'reward_claimed',
      walletAddress,
      amount,
      timestamp: new Date().toISOString(),
    };

    this.broadcast(roomId, message);
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      activeRooms: this.rooms.size,
      totalSubscriptions: Array.from(this.clients.values()).reduce(
        (sum, client) => sum + client.subscriptions.size,
        0,
      ),
    };
  }

  /**
   * Close the WebSocket server
   */
  close() {
    clearInterval(this.heartbeatInterval);

    // Close all client connections
    for (const [clientId, client] of this.clients) {
      client.ws.close(1000, 'Server shutting down');
    }

    this.wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }
}

export default WebSocketServer;
