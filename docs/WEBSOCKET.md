# WebSocket Real-Time Updates

**Issue #456**: WebSocket server for real-time campaign and reward notifications

## Overview

The Trivela WebSocket server provides real-time updates for campaign changes, participant
registrations, and reward notifications. Clients can subscribe to specific channels to receive live
updates without polling.

## Connection

### Server Endpoint

```
ws://localhost:3001/ws (development)
wss://api.trivela.app/ws (production)
```

### Client Connection

```javascript
import { getWebSocketClient } from './lib/websocket';

const wsClient = getWebSocketClient();
wsClient.connect();

wsClient.on('connected', () => {
  console.log('Connected to WebSocket server');
});
```

## Channels

### 1. Campaigns Channel

Subscribe to all campaign updates:

```javascript
wsClient.subscribe('campaigns');
```

Subscribe to a specific campaign:

```javascript
wsClient.subscribeToCampaign('campaign-123');
```

**Events:**

- `campaign_created` - New campaign created
- `campaign_update` - Campaign modified (name, status, etc.)
- `new_participant` - New participant registered

### 2. Rewards Channel

Subscribe to rewards for a specific wallet:

```javascript
wsClient.subscribeToWalletRewards('GXXX...XXX');
```

Subscribe to rewards for a campaign:

```javascript
wsClient.subscribe('rewards', { campaignId: 'campaign-123' });
```

**Events:**

- `reward_credited` - Points credited to user
- `reward_claimed` - Points claimed by user

## Message Format

### Client → Server

#### Subscribe

```json
{
  "type": "subscribe",
  "channel": "campaigns",
  "campaignId": "campaign-123" // optional
}
```

#### Unsubscribe

```json
{
  "type": "unsubscribe",
  "channel": "campaigns"
}
```

#### Ping

```json
{
  "type": "ping"
}
```

### Server → Client

#### Connected

```json
{
  "type": "connected",
  "clientId": "client_1234567890_abc123xyz",
  "timestamp": "2026-06-04T10:30:00.000Z"
}
```

#### Campaign Created

```json
{
  "type": "campaign_created",
  "campaign": {
    "id": "campaign-123",
    "name": "Summer Campaign",
    "active": true,
    "rewardPerAction": 100
  },
  "timestamp": "2026-06-04T10:30:00.000Z"
}
```

#### Campaign Updated

```json
{
  "type": "campaign_update",
  "campaignId": "campaign-123",
  "update": {
    "campaign": {
      /* full campaign object */
    },
    "changes": ["active", "rewardPerAction"],
    "before": {
      /* previous values */
    }
  },
  "timestamp": "2026-06-04T10:30:00.000Z"
}
```

#### New Participant

```json
{
  "type": "new_participant",
  "campaignId": "campaign-123",
  "participant": {
    "walletAddress": "GXXX...XXX",
    "registeredAt": "2026-06-04T10:30:00.000Z"
  },
  "timestamp": "2026-06-04T10:30:00.000Z"
}
```

#### Reward Credited

```json
{
  "type": "reward_credited",
  "walletAddress": "GXXX...XXX",
  "amount": 100,
  "campaignId": "campaign-123",
  "timestamp": "2026-06-04T10:30:00.000Z"
}
```

#### Reward Claimed

```json
{
  "type": "reward_claimed",
  "walletAddress": "GXXX...XXX",
  "amount": 500,
  "timestamp": "2026-06-04T10:30:00.000Z"
}
```

## Frontend Integration

### React Hook Example

```jsx
import { useEffect, useState } from 'react';
import { getWebSocketClient } from '../lib/websocket';

function useCampaignUpdates(campaignId) {
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    const wsClient = getWebSocketClient();
    wsClient.connect();

    wsClient.subscribeToCampaign(campaignId);

    const unsubscribe = wsClient.on('campaign_update', (data) => {
      if (data.campaignId === campaignId) {
        setUpdates((prev) => [...prev, data]);
      }
    });

    return () => {
      wsClient.unsubscribe(`campaigns:campaign:${campaignId}`);
      unsubscribe();
    };
  }, [campaignId]);

  return updates;
}
```

### Live Participant Count

```jsx
function CampaignDetail({ campaignId }) {
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    const wsClient = getWebSocketClient();
    wsClient.connect();
    wsClient.subscribeToCampaign(campaignId);

    const unsubscribe = wsClient.on('new_participant', (data) => {
      if (data.campaignId === campaignId) {
        setParticipantCount((prev) => prev + 1);
      }
    });

    return () => unsubscribe();
  }, [campaignId]);

  return <div>Participants: {participantCount}</div>;
}
```

## Server Configuration

### Environment Variables

```bash
# Enable/disable WebSocket server
ENABLE_WEBSOCKET=true

# WebSocket path (default: /ws)
WEBSOCKET_PATH=/ws
```

### Programmatic Usage

```javascript
import { initializeWebSocket, getWebSocketServer } from './websocket';

// Initialize on server start
const httpServer = app.listen(3001);
initializeWebSocket(httpServer);

// Get server instance
const wsServer = getWebSocketServer();

// Notify clients
wsServer.notifyCampaignUpdate(campaignId, update);
wsServer.notifyRewardCredited(walletAddress, amount, campaignId);
```

## Connection Management

### Heartbeat

The server sends ping frames every 30 seconds to detect dead connections. Clients should respond
with pong frames automatically (handled by the browser WebSocket API).

### Reconnection

The client automatically attempts to reconnect with exponential backoff:

- Attempt 1: 3 seconds
- Attempt 2: 6 seconds
- Attempt 3: 9 seconds
- Max attempts: 5

After reconnection, all previous subscriptions are automatically restored.

### Connection Limits

No hard connection limit by default. For production, consider using a reverse proxy (nginx, HAProxy)
with connection limits.

## Security

### CORS

WebSocket connections respect the same origin policy. Configure allowed origins in the backend CORS
settings.

### Authentication

Currently, WebSocket connections don't require authentication. Future enhancements:

- API key in connection URL
- JWT token validation
- Rate limiting per IP

### Rate Limiting

Consider implementing rate limits for:

- Connection attempts per IP
- Message frequency per client
- Subscription count per client

## Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

Response includes WebSocket stats:

```json
{
  "status": "ok",
  "websocket": {
    "connectedClients": 42,
    "activeRooms": 15,
    "totalSubscriptions": 87
  }
}
```

### Metrics

Track these metrics in production:

- Active connections
- Messages per second
- Reconnection rate
- Average subscription count
- Room distribution

## Testing

### Manual Testing with wscat

```bash
npm install -g wscat
wscat -c ws://localhost:3001/ws

# Subscribe to campaigns
> {"type":"subscribe","channel":"campaigns"}

# Ping
> {"type":"ping"}
```

### Automated Testing

```javascript
import WebSocket from 'ws';

test('WebSocket connection', async () => {
  const ws = new WebSocket('ws://localhost:3001/ws');

  await new Promise((resolve) => {
    ws.on('open', resolve);
  });

  ws.send(
    JSON.stringify({
      type: 'subscribe',
      channel: 'campaigns',
    }),
  );

  const message = await new Promise((resolve) => {
    ws.on('message', (data) => {
      resolve(JSON.parse(data));
    });
  });

  expect(message.type).toBe('subscribed');

  ws.close();
});
```

## Troubleshooting

### Connection Refused

- Check that ENABLE_WEBSOCKET is not set to 'false'
- Verify the server is running on the expected port
- Check firewall rules

### Messages Not Received

- Verify subscription is successful (check for 'subscribed' message)
- Check console for JavaScript errors
- Verify the campaign/wallet ID is correct

### Frequent Disconnections

- Check network stability
- Verify the server isn't being restarted
- Check server logs for errors

## Future Enhancements

- [ ] Authentication with API keys or JWT
- [ ] Message encryption (TLS/SSL)
- [ ] Binary message support (Protocol Buffers)
- [ ] Message persistence for offline clients
- [ ] Presence detection (who's viewing a campaign)
- [ ] Broadcast to all clients (admin announcements)
- [ ] Rate limiting per client
- [ ] Redis adapter for horizontal scaling

## References

- WebSocket Protocol: https://tools.ietf.org/html/rfc6455
- ws library: https://github.com/websockets/ws
- MDN WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
