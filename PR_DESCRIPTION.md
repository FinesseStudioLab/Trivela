# PR Description

## Summary

This PR implements four major ecosystem and mobile enhancements to improve user onboarding, partner integration, mobile accessibility, and operational transparency:

1. **#808** - In-app testnet faucet/funding helper for new users
2. **#811** - Partner webhook subscription management UI with delivery logs and replay
3. **#812** - Mobile wallet deep-link/WalletConnect flow for mobile signing
4. **#818** - Public status page with incident communication and maintenance notices

## Changes

### #808: In-app testnet faucet/funding helper

**Backend:**
- Created `backend/src/routes/faucet.js` - New faucet route with:
  - POST `/api/v1/faucet/fund` - Friendbot integration with rate limiting (5 requests/hour)
  - GET `/api/v1/faucet/status` - Faucet availability and rate limit info
  - Testnet-only validation with mainnet fallback guidance
  - Abuse guards via rate limiting middleware

**Frontend:**
- Created `frontend/src/components/FaucetModal.jsx` - Modal component with:
  - Account funding via Friendbot
  - Network detection (testnet vs mainnet)
  - Mainnet shows asset acquisition guidance instead
  - Success/error states with transaction hash display
  - Rate limit information display
- Updated `frontend/src/components/Header.jsx` - Added:
  - "Fund" button for testnet users
  - Faucet modal integration
  - Balance refresh after successful funding

**Acceptance Criteria Met:**
- ✅ New testnet user can fund and participate without leaving the app
- ✅ Faucet is abuse-limited (5 requests/hour per IP)
- ✅ Clear flow: connect → fund → participate
- ✅ Mainnet variant documents how to acquire assets

---

### #811: Partner webhook subscription management UI

**Backend:**
- Created `backend/src/routes/webhooks.js` - Webhook management API with:
  - POST `/api/v1/webhooks` - Register webhook endpoints with event subscriptions
  - GET `/api/v1/webhooks` - List all webhooks
  - GET `/api/v1/webhooks/:id` - Get specific webhook details
  - PUT `/api/v1/webhooks/:id` - Update webhook (URL, events, rotate secret)
  - DELETE `/api/v1/webhooks/:id` - Delete webhook
  - GET `/api/v1/webhooks/:id/deliveries` - View delivery logs
  - POST `/api/v1/webhooks/:id/deliveries/:deliveryId/replay` - Replay failed deliveries (idempotent)
  - POST `/api/v1/webhooks/:id/test` - Test-send with signature verification
  - HMAC-SHA256 signature generation for webhook security
  - In-memory storage (production should use database)

**Frontend:**
- Created `frontend/src/components/WebhookManagement.jsx` - Full management UI with:
  - Webhook list with status indicators
  - Create webhook modal (URL, events, description, secret)
  - Webhook details view with delivery logs
  - Secret rotation functionality
  - Test webhook with sample events
  - Failed delivery replay with one-click retry
  - Signature verification helper in test results
  - Event type filtering (campaign.created, campaign.updated, participant.registered, reward.claimed)

**Acceptance Criteria Met:**
- ✅ Partners can self-manage webhooks without support
- ✅ View delivery logs with status, response codes
- ✅ Replay failed deliveries with one click
- ✅ Rotate signing secrets
- ✅ Test-send and signature verification helper

---

### #812: Mobile wallet deep-link/WalletConnect flow

**Frontend:**
- Created `frontend/src/components/MobileWalletConnect.jsx` - Mobile wallet connection with:
  - Deep-link support for Lobstr, Freighter, Rabet, xBull
  - Universal link fallback for iOS
  - App-switch round trip handling with state restoration
  - 2-minute connection timeout
  - LocalStorage-based state persistence for return handling
  - Mobile device detection with desktop fallback message
  - Fallback guidance when wallet not installed
  - Connection states: idle, connecting, waiting, success, error
  - Transaction signing support (prepare for future use)
  - Clear UX instructions for the flow

**Acceptance Criteria Met:**
- ✅ Mobile user connects via deep link
- ✅ App-switch round trips handled correctly
- ✅ State restoration on return to app
- ✅ Timeout handling (2 minutes)
- ✅ Fallback guidance when no compatible wallet installed
- ✅ Desktop users get appropriate guidance

---

### #818: Public status page + incident communication

**Backend:**
- Created `backend/src/routes/status.js` - Status page API with:
  - GET `/api/v1/status` - Public status page with component health
  - Component health checks (API, Soroban RPC, Indexer, Contracts, Database)
  - Real-time latency tracking for RPC endpoint
  - Incident lifecycle management (investigating → identified → monitoring → resolved)
  - POST `/api/v1/status/incidents` - Create incidents with impact levels
  - PUT `/api/v1/status/incidents/:id` - Update incidents with status changes
  - DELETE `/api/v1/status/incidents/:id` - Delete incidents
  - GET `/api/v1/status/incidents` - List all incidents (filterable by status)
  - POST `/api/v1/status/maintenance` - Create scheduled maintenance notices
  - DELETE `/api/v1/status/maintenance/:id` - Delete maintenance notices
  - POST `/api/v1/status/subscribe` - Subscribe to status updates via email
  - DELETE `/api/v1/status/subscribe/:id` - Unsubscribe
  - Overall status calculation (operational/degraded/outage)
  - Component status affected by active incidents

**Frontend:**
- Created `frontend/src/components/StatusPage.jsx` - Public status page with:
  - Real-time component status display with health indicators
  - Overall system status banner
  - Component list with descriptions and latency
  - Active incidents with impact levels (none/minor/major/critical)
  - Incident timeline with updates
  - Scheduled maintenance notices with date ranges
  - Email subscription for status updates
  - Auto-refresh every 30 seconds
  - Responsive design with clear visual hierarchy
  - Color-coded status indicators (green/yellow/red)

**Acceptance Criteria Met:**
- ✅ Real-time component status is public
- ✅ Incidents communicated with lifecycle (investigating → identified → resolved)
- ✅ Scheduled maintenance notices displayed
- ✅ Users can subscribe for updates
- ✅ Simulated dependency outage flips component to degraded

---

## Files Added

**Backend:**
- `backend/src/routes/faucet.js` - Testnet faucet routes
- `backend/src/routes/webhooks.js` - Webhook management routes
- `backend/src/routes/status.js` - Status page and incident management routes

**Frontend:**
- `frontend/src/components/FaucetModal.jsx` - Faucet modal component
- `frontend/src/components/WebhookManagement.jsx` - Webhook management UI
- `frontend/src/components/MobileWalletConnect.jsx` - Mobile wallet connection component
- `frontend/src/components/StatusPage.jsx` - Public status page component

## Files Modified

**Backend:**
- `backend/src/index.js` - Added imports and route registrations for faucet, webhooks, and status routes

**Frontend:**
- `frontend/src/components/Header.jsx` - Added faucet modal integration and "Fund" button for testnet users

## Testing

### #808 Verification
- E2E: Fresh account → in-app fund → successful register
- Rate limiting: 5 requests per hour enforced
- Mainnet shows guidance instead of faucet

### #811 Verification
- E2E: Create endpoint → receive signed event → replay failed delivery
- Secret rotation generates new secret
- Test webhook sends with verifiable signature

### #812 Verification
- Mobile E2E: Connect → sign → return reliably
- Desktop shows appropriate fallback message
- Timeout handling after 2 minutes
- State restoration on app return

### #818 Verification
- Status page displays real-time component health
- Incident creation and lifecycle updates
- Maintenance notices with scheduled windows
- Email subscription flow
- Auto-refresh every 30 seconds

## Notes

- Webhook storage is in-memory for this implementation; production should use a database
- Status page incidents and maintenance are in-memory; production should use persistent storage
- Mobile wallet deep-links use localStorage for state; consider URL parameters for better security
- Rate limiting on faucet uses existing middleware; Redis recommended for production scaling
- Status page health checks are basic; can be expanded with more sophisticated monitoring

## Closes

Closes #808, #811, #812, #818
