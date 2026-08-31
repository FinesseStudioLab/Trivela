/**
 * WebSocket client for real-time updates
 */
class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.ws = null;
    this.clientId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.reconnectTimer = null;
    this.isIntentionallyClosed = false;

    // Event handlers
    this.handlers = {
      connected: [],
      disconnected: [],
      error: [],
      message: [],
      campaign_update: [],
      new_participant: [],
      reward_credited: [],
      reward_claimed: [],
    };

    // Subscriptions
    this.subscriptions = new Set();
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      console.warn('WebSocket already connected or connecting');
      return;
    }

    this.isIntentionallyClosed = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.emit('connected');

        // Resubscribe to previous subscriptions
        this.resubscribe();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.emit('disconnected', { code: event.code, reason: event.reason });

        // Attempt reconnection if not intentionally closed
        if (!this.isIntentionallyClosed) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    const { type } = data;

    switch (type) {
      case 'connected':
        this.clientId = data.clientId;
        break;

      case 'subscribed':
      case 'unsubscribed':
      case 'pong':
        // Acknowledgment messages
        break;

      case 'error':
        console.error('WebSocket error message:', data.message);
        this.emit('error', new Error(data.message));
        break;

      default:
        // Emit type-specific events
        this.emit(type, data);
        // Also emit generic message event
        this.emit('message', data);
        break;
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(
      `Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Resubscribe to previous subscriptions after reconnection
   */
  resubscribe() {
    for (const subscription of this.subscriptions) {
      this.send(subscription);
    }
  }

  /**
   * Subscribe to a channel
   * @param {string} channel - Channel name (campaigns, rewards)
   * @param {Object} options - Additional options (campaignId, walletAddress)
   */
  subscribe(channel, options = {}) {
    const message = {
      type: 'subscribe',
      channel,
      ...options,
    };

    this.subscriptions.add(message);
    this.send(message);
  }

  /**
   * Unsubscribe from a channel
   * @param {string} channel - Channel name
   */
  unsubscribe(channel) {
    const message = {
      type: 'unsubscribe',
      channel,
    };

    // Remove from subscriptions
    this.subscriptions = new Set(
      Array.from(this.subscriptions).filter(
        (sub) => !(sub.type === 'subscribe' && sub.channel === channel),
      ),
    );

    this.send(message);
  }

  /**
   * Subscribe to campaign updates
   * @param {string} campaignId
   */
  subscribeToCampaign(campaignId) {
    this.subscribe('campaigns', { campaignId });
  }

  /**
   * Subscribe to rewards for a wallet
   * @param {string} walletAddress
   */
  subscribeToWalletRewards(walletAddress) {
    this.subscribe('rewards', { walletAddress });
  }

  /**
   * Send a message to the server
   */
  send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send message');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Handler function
   */
  on(event, handler) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Unregister an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Handler function
   */
  off(event, handler) {
    if (!this.handlers[event]) return;

    this.handlers[event] = this.handlers[event].filter((h) => h !== handler);
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this.handlers[event]) return;

    for (const handler of this.handlers[event]) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in ${event} handler:`, error);
      }
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.isIntentionallyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.clientId = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Get connection status
   */
  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get current state
   */
  get state() {
    if (!this.ws) return 'CLOSED';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
      default:
        return 'CLOSED';
    }
  }
}

// Singleton instance
let wsClient = null;

/**
 * Get or create WebSocket client instance
 * @param {string} url - WebSocket URL
 * @param {Object} options - Client options
 * @returns {WebSocketClient}
 */
export function getWebSocketClient(url, options) {
  if (!wsClient) {
    const wsUrl =
      url ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    wsClient = new WebSocketClient(wsUrl, options);
  }
  return wsClient;
}

/**
 * Close and cleanup WebSocket client
 */
export function closeWebSocketClient() {
  if (wsClient) {
    wsClient.disconnect();
    wsClient = null;
  }
}

export default WebSocketClient;
