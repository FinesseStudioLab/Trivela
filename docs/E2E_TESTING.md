# E2E Testing: Campaign Lifecycle Test Suite (#489)

## Overview

This document describes the end-to-end testing infrastructure for testing the complete campaign
lifecycle from creation through reward claiming.

## Test Structure

### Test Files

Located in `frontend/tests/e2e/`:

1. **`basic.spec.js`** - Landing page and basic navigation
2. **`campaigns.spec.js`** - Campaign listing, filtering, and interaction
3. **`leaderboard.spec.js`** - Leaderboard display and pagination
4. **`campaign-lifecycle.test.ts`** - Complete lifecycle test (new)

### Test Environment

- **Playwright**: Browser automation framework
- **Base URL**: `http://localhost:4173` (Vite preview server)
- **Timeout**: 30 seconds per test
- **Retries**: 1 in CI, 0 locally
- **Artifacts**: Screenshots, traces, and videos retained on failure

## Running Tests

### Basic E2E Tests (Existing)

```bash
cd frontend

# Build and test
npm run build
npm run test

# Or just E2E
npm run test:e2e
```

### Campaign Lifecycle Test (New)

The lifecycle test exercises the full user journey:

```bash
cd frontend

# Run only the lifecycle test
npm run test:e2e:lifecycle

# With environment variables
BACKEND_URL=http://localhost:3001 \
FRONTEND_URL=http://localhost:5173 \
TEST_ADMIN_API_KEY=your-key \
TEST_USER_ACCOUNT=GXXXXXX... \
npm run test:e2e:lifecycle
```

## Lifecycle Test Flow

### Prerequisites

1. **Backend Running**: Accessible at `$BACKEND_URL` (default: `http://localhost:3001`)
2. **Frontend Running**: Accessible at `$FRONTEND_URL` (default: `http://localhost:5173`)
3. **Redis** (optional): For caching
4. **Test Credentials**:
   - `TEST_ADMIN_API_KEY`: API key with admin permissions
   - `TEST_USER_ACCOUNT`: Stellar public key for test participant
   - `TEST_USER_SECRET`: Stellar secret key for test participant

### Test Steps

#### 1. Campaign Creation (API)

```
POST /api/v1/campaigns
Headers: X-API-Key: {admin-key}
Body: {
  name: "E2E Test Campaign {timestamp}",
  slug: "e2e-test-{timestamp}",
  description: "...",
  rewardPerAction: 100,
  tags: ["e2e", "test"],
  active: true
}
```

- ✅ Campaign created with ID
- ✅ Campaign retrieved by slug
- ✅ Campaign visible in list

#### 2. Campaign Page Navigation

```
GET /campaign/{slug}
```

- ✅ Page loads with correct title
- ✅ Campaign details displayed (name, description, tags)
- ✅ Mock Freighter wallet injected into browser context

#### 3. Wallet Connection (Ready for UI Implementation)

```
Button Click: "Connect Wallet"
```

- Placeholder: Freighter API mock installed
- Future: Integration with real Freighter extension
- Status: Test infrastructure ready, UI component pending

#### 4. Campaign Metadata Persistence

```
GET /api/v1/campaigns/{id}
```

- ✅ All fields persisted correctly
- ✅ Tags and metadata intact
- ✅ Timestamps valid

#### 5. Campaign Updates

```
PUT /api/v1/campaigns/{id}
Headers: X-API-Key: {admin-key}
Body: { rewardPerAction: 150, ... }
```

- ✅ Updates applied successfully
- ✅ Data persists

#### 6. Future: Contract Interaction

- Deploy campaign contract to testnet
- Deploy rewards contract to testnet
- Link contract IDs to campaign (PUT /api/v1/campaigns/{id})
- User registers (calls campaign.register())
- User claims (calls rewards.claim())

## Freighter Wallet Mocking

The lifecycle test includes a mock Freighter wallet API for browser testing without requiring a real
wallet extension:

```javascript
// Injected into page context
window.freighter = {
  isConnected: async () => true,
  getPublicKey: async () => publicKey,
  signTransaction: async (tx) => signedTx,
  signAuthEntry: async (entry) => signedEntry,
  isAllowed: async () => true,
  isValidPublicKey: (pk) => pk.startsWith('G'),
};
```

### Implementation Status

| Feature              | Status         | Notes                             |
| -------------------- | -------------- | --------------------------------- |
| Mock wallet API      | ✅ Implemented | Injected before navigation        |
| Campaign creation    | ✅ Working     | API fully functional              |
| Page navigation      | ✅ Working     | Basic page loads verified         |
| Wallet connection UI | ⏳ Pending     | Need to implement UI component    |
| Contract deployment  | ⏳ Pending     | Requires Rust build + Soroban CLI |
| Transaction signing  | ⏳ Pending     | Awaits UI + contract setup        |
| Points crediting     | ⏳ Pending     | Awaits contract interaction       |
| Claim flow           | ⏳ Pending     | Awaits full contract integration  |

## Setting Up the Test Environment

### Local Testing

```bash
# Terminal 1: Docker Compose (backend + frontend + redis)
docker compose up -d

# Terminal 2: Run tests
cd frontend
npm install
npm run test:e2e:lifecycle
```

### CI/CD Integration

Create `.github/workflows/e2e-lifecycle.yml`:

```yaml
name: E2E Campaign Lifecycle Test

on:
  workflow_dispatch: # Manual trigger only (slow test)
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC

jobs:
  e2e-lifecycle:
    runs-on: ubuntu-latest
    services:
      backend:
        image: node:20-alpine
        options: >-
          --health-cmd "node -e \"require('http').get('http://localhost:3001/api/v1/health', (r) =>
          process.exit(r.statusCode === 200 ? 0 : 1))\"" 
          --health-interval 10s --health-timeout 5s --health-retries 5
        env:
          PORT: 3001
          STELLAR_NETWORK: testnet

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping" --health-interval 10s

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci --workspace=frontend

      - run: npm run build --workspace=frontend

      - run: npm run test:e2e:lifecycle --workspace=frontend
        env:
          BACKEND_URL: http://localhost:3001
          FRONTEND_URL: http://localhost:5173
          TEST_ADMIN_API_KEY: ${{ secrets.TEST_ADMIN_API_KEY }}

      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: e2e-lifecycle-results
          path: |
            frontend/test-results/
            frontend/playwright-report/
          retention-days: 7
```

## Debugging Tests

### View Test Report

```bash
# After test run
npx playwright show-report
```

### Debug Single Test

```bash
# Run with headed browser (see what's happening)
npx playwright test tests/e2e/campaign-lifecycle.test.ts --headed

# Debug mode (interactive step-through)
npx playwright test tests/e2e/campaign-lifecycle.test.ts --debug
```

### Check Network Calls

Playwright captures network activity in traces:

```bash
# Traces are saved on failure and can be viewed
npx playwright show-trace trace.zip
```

## Troubleshooting

### Backend Not Ready

```
Error: Backend did not become ready after 30000ms
```

**Solution**: Start backend first with `docker compose up -d backend` and wait for health check.

### Campaign Creation Fails

```
Error: Failed to create campaign: 401 Unauthorized
```

**Solution**: Set valid `TEST_ADMIN_API_KEY` environment variable.

### Page Navigation Timeout

```
Error: Timeout waiting for page load
```

**Solution**:

- Verify frontend is running on correct port
- Check `FRONTEND_URL` environment variable
- Check browser logs in trace file

### Mock Wallet Not Found

```
Warning: Connect wallet button not found
```

**Solution**: This is expected if wallet UI hasn't been implemented yet. Test infrastructure is
ready for future UI integration.

## Future Enhancements

### Phase 1: Basic Lifecycle (Current)

- [x] Campaign creation via API
- [x] Campaign persistence
- [ ] Contract deployment automation
- [ ] Freighter wallet UI integration

### Phase 2: Contract Interaction

- [ ] User registration flow
- [ ] Admin credit interface
- [ ] Points claiming

### Phase 3: Advanced Scenarios

- [ ] Cross-browser testing (Firefox, Safari)
- [ ] Multi-user scenarios
- [ ] Merkle tree allowlist validation
- [ ] Error recovery flows

### Phase 4: Performance & Security

- [ ] Load testing with multiple users
- [ ] XSS payload injection tests
- [ ] Rate limiting verification
- [ ] SQL injection prevention verification

## References

- [Playwright Documentation](https://playwright.dev/)
- [Freighter Wallet API](https://developers.stellar.org/docs/build/apps/wallet/freighter-api/)
- [Stellar JavaScript SDK](https://stellar.org/developers/js-stellar-sdk/reference/)
- [Soroban Smart Contracts](https://developers.stellar.org/docs/build/smart-contracts/)

## Related Issues

- [#488 - Security: XSS Prevention](../SECURITY_XSS_PREVENTION.md)
- [#490 - Cross-browser Testing](#490-cross-browser-matrix)
- [#492 - Contract Upgrade Tests](#492-contract-upgrade-tests)
- Issue #40 - CSP Headers
- Issue #278 - Contract Upgrades

---

**Test Added**: `frontend/tests/e2e/campaign-lifecycle.test.ts`  
**Scripts Added**: `npm run test:e2e:lifecycle`  
**Documentation**: This file

**Status**: ✅ Test infrastructure complete, ready for UI/contract integration
