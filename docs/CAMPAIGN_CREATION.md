# Campaign Creation Flow

This document describes the campaign creation flow in Trivela, including both off-chain record
creation and optional on-chain contract deployment.

## Overview

Campaigns in Trivela can exist in two modes:

1. **Off-chain only**: Campaign metadata stored in the backend database without blockchain anchoring
2. **On-chain anchored**: Campaign linked to a deployed Soroban campaign contract for trustless,
   decentralized operation

## Architecture

### Backend Components

- **Database Schema**: `campaigns` table with `contract_id` field (nullable)
- **API Endpoints**:
  - `POST /api/v1/campaigns` - Create new campaign
  - `PUT /api/v1/campaigns/:id` - Update existing campaign (including contract ID)
- **Validation**: Zod schemas enforce contract ID format (`C[A-Z2-7]{55}`)

### Frontend Components

- **CreateCampaign.jsx**: Admin form for campaign creation with optional on-chain deployment
- **stellar.js**: `initializeCampaignContract()` function for contract initialization
- **TransactionStatus.jsx**: Displays transaction hash and Stellar Expert link

## Campaign Creation Flow

### 1. Off-Chain Campaign Creation

```
User fills form → POST /api/v1/campaigns → Campaign record created in SQLite
```

**Required fields:**

- `name` (string, required)
- `description` (string, optional)
- `rewardPerAction` (number, optional, default: 0)

**Optional fields:**

- `contractId` (string, nullable) - Stellar contract ID in format `C...`
- `slug`, `startDate`, `endDate`, `active`, `featured`, `hidden`, `hiddenReason`

### 2. On-Chain Contract Deployment (Optional)

When "Initialize contract on-chain" is enabled:

```
1. Create off-chain record
   ↓
2. Check wallet connection
   ↓
3. Call initializeCampaignContract(walletAddress, contractId)
   ↓
4. Build transaction: contract.call('initialize', admin_address)
   ↓
5. Prepare transaction (assemble auth + resources)
   ↓
6. Sign with wallet (Freighter/other)
   ↓
7. Submit to Soroban RPC
   ↓
8. Poll for confirmation (max 40 attempts, 1.5s interval)
   ↓
9. Update campaign record with contract ID
   ↓
10. Redirect to campaign detail page
```

**Transaction Flow:**

- **Build**: Create `TransactionBuilder` with `initialize` operation
- **Prepare**: `server.prepareTransaction()` adds auth entries and resource fees
- **Sign**: Wallet signs the XDR
- **Submit**: `server.sendTransaction()` broadcasts to network
- **Poll**: Wait for `status !== 'NOT_FOUND'`

### 3. Contract Initialization

The campaign contract must be initialized with an admin address before use:

```rust
pub fn initialize(env: Env, admin: Address) -> Result<(), Error>
```

This sets:

- Admin address (for privileged operations)
- Schema version
- Initial nonce (for replay protection)

## User Interface

### Admin Campaign Manager Form

**Fields:**

1. **Admin API Key** (password) - Required for all operations
2. **Edit existing campaign** (select) - Optional, loads campaign for editing
3. **Campaign name** (text) - Required
4. **Description** (textarea) - Optional
5. **Reward per action** (number) - Optional, default 0
6. **Contract ID** (text) - Optional, Stellar contract address
7. **Initialize contract on-chain** (checkbox) - Only shown when contract ID is provided

**States:**

- **Creating...** - Submitting form
- **Creating campaign record...** - POST request in progress
- **Checking wallet connection...** - Verifying wallet
- **Initializing contract on-chain...** - Transaction being signed/submitted
- **Contract initialized successfully!** - Transaction confirmed
- **Success** - Campaign created (with optional deployment confirmation)

### Transaction Status Display

After successful deployment, shows:

- ✓ Success badge
- Transaction hash (shortened, with copy button)
- "View on Stellar Expert" link

## Error Handling

### Common Errors

1. **Wallet not connected**
   - Message: "Wallet not connected. Please connect your wallet to deploy on-chain."
   - Solution: Connect wallet before enabling deployment

2. **Invalid contract ID**
   - Message: "contractId must be a valid Stellar contract ID (C...)"
   - Solution: Ensure contract ID matches pattern `C[A-Z2-7]{55}`

3. **Transaction failed**
   - Message: "Contract initialization failed on-chain."
   - Solution: Check wallet balance, contract state, and network status

4. **Transaction timeout**
   - Message: "Initialization transaction could not be confirmed in time."
   - Solution: Check Stellar Expert for transaction status, may need to retry

### Graceful Degradation

- If on-chain deployment fails, the off-chain campaign record is still created
- Users can manually update the `contractId` later via the edit form
- Contract initialization can be retried independently

## Contract Deployment Prerequisites

### Option 1: Pre-deployed Contract (Recommended)

1. Deploy campaign contract WASM using `stellar-cli`:

   ```bash
   stellar contract deploy \
     --wasm target/wasm32-unknown-unknown/release/campaign.wasm \
     --source ADMIN_SECRET_KEY \
     --network testnet
   ```

2. Copy the returned contract ID (starts with `C`)

3. Enter contract ID in the "Contract ID" field

4. Enable "Initialize contract on-chain" checkbox

### Option 2: Backend Deployment Service (Future)

A backend service could handle WASM upload and contract creation:

```
POST /api/v1/contracts/deploy
{
  "wasmHash": "...",
  "contractType": "campaign"
}
```

This would return a contract ID that can be used in campaign creation.

## Security Considerations

1. **Admin API Key**: Stored in session storage only, never persisted
2. **Wallet Signature**: User must explicitly approve contract initialization
3. **Nonce Protection**: Contract uses nonce-based replay protection for admin operations
4. **Contract Ownership**: Only the initializing wallet can perform admin operations

## Testing

### Manual Testing Checklist

- [ ] Create campaign without contract ID
- [ ] Create campaign with contract ID (no deployment)
- [ ] Create campaign with contract ID and deployment
- [ ] Edit existing campaign to add contract ID
- [ ] Verify transaction appears on Stellar Expert
- [ ] Test error handling (wallet disconnected, invalid contract ID)
- [ ] Test deployment failure recovery

### Integration Tests

See `backend/src/integration/campaigns.test.js` for API tests.

## Future Enhancements

1. **Full Contract Deployment**: Upload WASM + create contract + initialize in one flow
2. **Contract Configuration**: Set time windows, max cap, Merkle root during creation
3. **Multi-signature Admin**: Support multiple admin addresses
4. **Contract Verification**: Verify contract code matches expected WASM hash
5. **Gas Estimation**: Show estimated XLM cost before deployment
6. **Batch Deployment**: Deploy multiple campaigns in one transaction

## References

- [Soroban Documentation](https://soroban.stellar.org/docs)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Campaign Contract Source](../contracts/campaign/src/lib.rs)
- [Frontend Stellar Integration](../frontend/src/stellar.js)
- [Backend Campaign API](../backend/src/index.js)
