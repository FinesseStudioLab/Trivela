# WebSocket Server Implementation

**Issue #456**: Real-time updates for campaigns and rewards

## Overview

This module provides a WebSocket server built on top of the `ws` library that enables real-time
communication between the backend and frontend. It supports room-based subscriptions, automatic
reconnection, and heartbeat monitoring.

## Architecture

### Components

1. **WebSocketServer** (`server.js`): Core WebSocket server implementation
   - Connection management
   - Room-based subscriptions
   - Broadcast capabilities
   - Heartbeat mechanism

2. **WebSocket Manager** (`index.js`): Singleton wrapper for server access
   - Server initialization
   - Global access to server instance
   - Graceful shutdown

3. **Client Library** (`frontend/src/lib/websocket.js`): Frontend WebSocket client
   - Connection management with auto-reconnect
   - Subscription handling
   - Event-based API

## Features

### Room-Based Subscriptions

Clients subscribe to specific "rooms" to receive targeted updates:

```javascript
// Subscribe to all campaigns
wsServer.broadcast('campaigns', message);

// Subscribe to a specific campaign
wsServer.broadcast('campaigns:campaign:123', message);

// Subscribe to rewards for a wallet
wsServer.broadcast('rewards:wallet:GXXX', message);
```

### Heartbeat Monitoring

The server sends ping frames every 30 seconds to detect dead connections. Connections that don't
respond are automatically terminated.

### Automatic Reconnection

The client automatically attempts to reconnect with exponential backoff:

- Max attempts: 5
- Base delay: 3 seconds
- Multiplier: 2x per attempt

### Subscription Persistence

When a client reconnects, all previous subscriptions are automatically restored.

## API

### Server API

#### `new WebSocketServer(httpServer, options)`

Creates a new WebSocket server.

**Parameters:**

- `httpServer` (http.Server): HTTP server instance
- `options` (Object):
  - `path` (string): WebSocket path (default: '/ws')
  - `verifyClient` (function): Optional client verification function

**Example:**

```javascript
import { createServer } from 'http';
import WebSocketServer from './websocket/server.js';

const httpServer = createServer(app);
const wsServer = new WebSocketServer(httpServer, { path: '/ws' });
```

#### `broadcast(roomId, data, excludeClientId)`

Broadcast a message to all clients in a room.

**Parameters:**

- `roomId` (string): Room identifier
- `data` (Object): Message payload
- `excludeClientId` (string, optional): Client ID to exclude

**Returns:** Number of clients that received the message

**Example:**

```javascript
wsServer.broadcast('campaigns', {
  type: 'campaign_created',
  campaign: { id: '123', name: 'Summer Campaign' },
});
```

#### `notifyCampaignUpdate(campaignId, update)`

Convenience method for campaign updates.

**Example:**

```javascript
wsServer.notifyCampaignUpdate('123', {
  campaign: { ... },
  changes: ['active', 'name']
});
```

#### `notifyRewardCredited(walletAddress, amount, campaignId)`

Convenience method for reward notifications.

**Example:**

```javascript
wsServer.notifyRewardCredited('GXXX...', 100, '123');
```

#### `getStats()`

Get server statistics.

**Returns:**

```javascript
{
  connectedClients: 42,
  activeRooms: 15,
  totalSubscriptions: 87
}
```

### Client API

#### `getWebSocketClient(url, options)`

Get or create WebSocket client singleton.

**Parameters:**

- `url` (string, optional): WebSocket URL (auto-detected if omitted)
- `options` (Object):
  - `maxReconnectAttempts` (number): Max reconnection attempts (default: 5)
  - `reconnectDelay` (number): Base reconnection delay in ms (default: 3000)

**Example:**

```javascript
import { getWebSocketClient } from './lib/websocket';

const wsClient = getWebSocketClient();
wsClient.connect();
```

#### `connect()`

Connect to WebSocket server.

#### `subscribe(channel, options)`

Subscribe to a channel.

**Parameters:**

- `channel` (string): Channel name
- `options` (Object):
  - `campaignId` (string, optional): Specific campaign
  - `walletAddress` (string, optional): Specific wallet

**Example:**

```javascript
wsClient.subscribe('campaigns', { campaignId: '123' });
```

#### `unsubscribe(channel)`

Unsubscribe from a channel.

#### `on(event, handler)`

Register an event handler.

**Events:**

- `connected`: Connection established
- `disconnected`: Connection closed
- `error`: Error occurred
- `message`: Any message received
- `campaign_update`: Campaign updated
- `campaign_created`: Campaign created
- `new_participant`: New participant registered
- `reward_credited`: Reward credited
- `reward_claimed`: Reward claimed

**Returns:** Unsubscribe function

**Example:**

```javascript
const unsubscribe = wsClient.on('campaign_update', (data) => {
  console.log('Campaign updated:', data);
});

// Later
unsubscribe();
```

## Integration

### Backend Integration

The WebSocket server is automatically initialized in `src/index.js` when the HTTP server starts:

```javascript
import { initializeWebSocket, getWebSocketServer } from './websocket/index.js';

const server = app.listen(3001);
initializeWebSocket(server);

// Later, send notifications
const wsServer = getWebSocketServer();
wsServer.notifyCampaignUpdate(campaignId, update);
```

### Frontend Integration

#### React Hook

```javascript
import { useEffect, useState } from 'react';
import { getWebSocketClient } from '../lib/websocket';

function useCampaignUpdates(campaignId) {
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    const wsClient = getWebSocketClient();
    wsClient.connect();
    wsClient.subscribeToCampaign(campaignId);

    const unsubscribe = wsClient.on('campaign_update', (data) => {
      setUpdates((prev) => [...prev, data]);
    });

    return () => {
      wsClient.unsubscribe(`campaigns:campaign:${campaignId}`);
      unsubscribe();
    };
  }, [campaignId]);

  return updates;
}
```

#### Component

```javascript
import LiveCampaignUpdates from './components/LiveCampaignUpdates';

function CampaignDetail({ campaignId }) {
  return (
    <div>
      <h1>Campaign Details</h1>
      <LiveCampaignUpdates campaignId={campaignId} />
    </div>
  );
}
```

## Testing

Run the WebSocket server tests:

```bash
cd backend
npm test src/websocket/server.test.js
```

Manual testing with wscat:

```bash
npm install -g wscat
wscat -c ws://localhost:3001/ws

# Subscribe
> {"type":"subscribe","channel":"campaigns"}

# Ping
> {"type":"ping"}
```

## Configuration

Environment variables:

```bash
# Enable/disable WebSocket
ENABLE_WEBSOCKET=true

# WebSocket path
WEBSOCKET_PATH=/ws
```

## Performance Considerations

### Connection Limits

No hard limit by default. For production, consider:

- Nginx/HAProxy connection limits
- OS file descriptor limits
- Memory usage (~10KB per connection)

### Message Size

Default max message size: 100MB (ws library default) Consider reducing for production:

```javascript
const wsServer = new WebSocket.Server({
  maxPayload: 1024 * 1024, // 1MB
});
```

### Scalability

For horizontal scaling across multiple backend instances:

- Use Redis pub/sub to sync messages
- Implement sticky sessions at load balancer
- Consider dedicated WebSocket servers

## Security

### CORS

WebSocket connections respect CORS settings from the backend.

### Rate Limiting

Consider implementing:

- Connection rate limit per IP
- Message rate limit per client
- Subscription limit per client

### Authentication

Currently unauthenticated. Future enhancements:

- API key in connection URL
- JWT token validation
- Session-based authentication

## Troubleshooting

### Connection fails

- Check ENABLE_WEBSOCKET is not 'false'
- Verify server is running
- Check firewall rules
- Inspect browser console for errors

### Messages not received

- Verify subscription success ('subscribed' message)
- Check room ID matches server broadcast
- Inspect network tab for WebSocket frames

### Frequent disconnections

- Check network stability
- Verify server isn't restarting
- Check server logs for errors
- Increase heartbeat interval if needed

## Future Enhancements

- [ ] Authentication (API keys, JWT)
- [ ] Rate limiting per client
- [ ] Message compression
- [ ] Binary message support
- [ ] Redis adapter for scaling
- [ ] Message persistence
- [ ] Presence detection
- [ ] Admin broadcast channel

## References

- WebSocket Protocol: https://tools.ietf.org/html/rfc6455
- ws library: https://github.com/websockets/ws
- MDN WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
