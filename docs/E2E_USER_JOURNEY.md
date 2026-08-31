# E2E User Journey Test

## Overview

The full user journey E2E test validates the complete happy-path flow from campaign discovery to
reward redemption, ensuring all critical integration points work correctly.

## Test Flow

The journey consists of 10 steps covering the entire user experience:

### 1. **Campaign Discovery** 🔍

**User Action**: Lands on homepage  
**Validation**:

- Homepage loads successfully
- Campaigns grid or empty state visible
- Page title contains "Trivela" or "Campaigns"

### 2. **Campaign Creation** ➕

**Admin Action**: Creates new campaign via API  
**Validation**:

- Campaign created with unique ID and slug
- API returns complete campaign object
- Campaign data persisted in database

### 3. **Campaign Details** 📄

**User Action**: Navigates to campaign detail page  
**Validation**:

- Campaign page loads with correct data
- Name and description displayed
- Campaign metadata visible (tags, reward amounts)

### 4. **Wallet Connection** 🔗

**User Action**: Connects Stellar wallet (Freighter)  
**Validation**:

- Connect button present and clickable
- Mock Freighter injected successfully
- Wallet connection indicator appears
- User's public key displayed (truncated)

### 5. **Campaign Participation** 👥

**User Action**: Registers/joins campaign  
**Validation**:

- Participate button present
- Registration flow available
- _Note: Contract interaction required for full test_

### 6. **Earning Points** ⭐

**Admin Action**: Credits points to user  
**Validation**:

- Admin can call credit function
- Points added to user's balance
- _Note: Requires deployed testnet contracts_

### 7. **Balance Check** 💰

**User Action**: Views points balance  
**Validation**:

- Profile/points page accessible
- Balance displayed correctly
- Points history visible

### 8. **Claiming Rewards** 🎁

**User Action**: Claims earned points  
**Validation**:

- Claim button available
- Claim amount input works
- Transaction signing flow initiated
- _Note: Contract interaction required_

### 9. **Redemption** 🪙

**User Action**: Redeems points for asset tokens  
**Validation**:

- Redeem button available
- Redemption rate displayed
- Token transfer initiated
- _Note: Requires redemption reserve funding_

### 10. **Journey Completion** ✅

**User Action**: Returns to homepage  
**Validation**:

- Navigation works correctly
- Campaign still visible in list
- User state persisted
- No errors in console

## Running the Test

### Prerequisites

1. **Backend running** at `http://localhost:3001`
2. **Frontend running** at `http://localhost:5173`
3. **Test environment variables**:
   ```bash
   export TEST_ADMIN_API_KEY=sk_test_...
   export TEST_USER_ACCOUNT=GXXXXXXX...
   export TEST_USER_SECRET=SXXXXXXX...
   ```

### Start the stack

```bash
# Terminal 1: Start backend
npm run dev:backend

# Terminal 2: Start frontend
npm run dev:frontend

# Terminal 3: Run test
npm run test:e2e:lifecycle --workspace=frontend
```

### With Docker Compose

```bash
# Start all services
docker compose up -d

# Run test
npx playwright test tests/e2e/campaign-lifecycle.test.ts
```

## Test Modes

### 1. **CI Mode** (Deterministic)

- Uses seeded test data
- Runs against preview build
- Skips if backend not reachable
- No contract interactions

### 2. **Local Mode** (Interactive)

- Live backend connection
- Real-time data creation
- Can test wallet interactions
- Useful for debugging

### 3. **Integration Mode** (Full Stack)

- Deployed testnet contracts
- Actual transaction signing
- Real on-chain state changes
- Requires funded accounts

## Current Limitations

### Contract Interactions

The following steps require deployed Soroban contracts on testnet:

- ✅ Campaign registration (`campaign.register()`)
- ✅ Points crediting (`rewards.credit()`)
- ✅ Points claiming (`rewards.claim()`)
- ✅ Token redemption (`rewards.redeem()`)

**Workaround**: Test validates UI presence and flow without actual contract calls.

### Wallet Signing

- Test uses mock Freighter API
- Does not validate actual signatures
- Transaction broadcasting skipped

**Workaround**: Integration tests cover contract logic separately.

## Extending the Test

### Adding New Journey Steps

```typescript
test('step 11: user refers a friend', async ({ page }) => {
  console.log('Step 11: User shares referral link');

  // Navigate to referral page
  await page.goto(`${FRONTEND_URL}/campaign/${campaignSlug}/refer`);

  // Get referral link
  const referralLink = page.locator('[data-testid="referral-link"]');
  await expect(referralLink).toBeVisible();

  const link = await referralLink.textContent();
  console.log(`✅ Referral link generated: ${link}`);
});
```

### Testing Error Flows

```typescript
test('user journey - insufficient balance', async ({ page }) => {
  // Try to claim more than balance
  await page.fill('[name="claim-amount"]', '999999');
  await page.click('button:has-text("Claim")');

  // Verify error message
  await expect(page.getByText(/insufficient balance/i)).toBeVisible();
});
```

## Debugging

### Enable verbose logging

```bash
DEBUG=pw:api npx playwright test campaign-lifecycle.test.ts
```

### View test trace

```bash
npx playwright show-trace test-results/*/trace.zip
```

### Step-through debugging

```bash
npx playwright test --debug campaign-lifecycle.test.ts
```

## CI Integration

The test runs in CI when:

- ✅ Backend service is healthy
- ✅ Frontend build succeeds
- ✅ Test timeout not exceeded (default: 2 minutes)

**Skip Conditions**:

- Backend not reachable (no Docker Compose)
- Frontend build failed
- Network issues

## Success Metrics

A successful journey completion validates:

- ✅ **Frontend routing**: All page transitions work
- ✅ **API integration**: Backend endpoints respond correctly
- ✅ **Wallet mocking**: Freighter simulation functional
- ✅ **State persistence**: Data survives navigation
- ✅ **Error handling**: No uncaught exceptions
- ✅ **UI completeness**: All critical elements present

## Known Issues

### Issue #959 (Addressed)

**Problem**: No comprehensive E2E test for complete user journey  
**Solution**: Implemented 10-step journey test covering discovery → redemption  
**Status**: ✅ Resolved

### Future Enhancements

- [ ] Add contract deployment to test setup
- [ ] Implement real transaction signing
- [ ] Add referral flow testing
- [ ] Test multi-campaign participation
- [ ] Add mobile viewport journey test

## Related Documentation

- [E2E Test Suite Overview](../frontend/tests/e2e/README.md)
- [Cross-Browser Testing](../frontend/tests/e2e/README.md#cross-browser-compatibility)
- [Campaign Lifecycle Implementation](../frontend/tests/e2e/campaign-lifecycle.test.ts)
- [Contract Integration Tests](../contracts/integration/)

## Contact

For questions about the E2E journey test:

- Check test logs for detailed step-by-step output
- Review Playwright traces in `test-results/`
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for dev environment setup
