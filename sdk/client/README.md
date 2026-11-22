# @trivela/client

Official TypeScript SDK for Trivela - A Stellar-based campaign rewards platform.

## Features

- Type-safe API client (auto-generated from OpenAPI)
- Smart contract bindings for Soroban contracts
- Zero-knowledge proof utilities
- Full TypeScript support

## Installation

```bash
npm install @trivela/client @stellar/stellar-sdk
```

## Usage

### REST API Client

```typescript
import type { Campaign } from '@trivela/client';
```

### Smart Contract Bindings

```typescript
import { RewardsContract } from '@trivela/client/contracts';

const rewards = new RewardsContract({
  contractId: 'CC...',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

const balance = await rewards.balance({ user: 'GABC...' });
```

### Issue #903: Campaign Supply Cap

```typescript
// Set campaign supply cap
await rewards.set_campaign_supply_cap({
  admin: adminAddress,
  campaign_id: 1n,
  cap: 1000000n,
});

// Check remaining supply
const cap = await rewards.campaign_supply_cap({ campaign_id: 1n });
const issued = await rewards.campaign_issued({ campaign_id: 1n });
console.log(`Remaining: ${cap - issued}`);
```

### Issue #898: Multi-Level Referrals

```typescript
// Configure 3-level referral tree
await rewards.set_multi_level_referral_config({
  admin: adminAddress,
  depth: 3,
  tier_rates: [5000, 2500, 1250], // 50%, 25%, 12.5%
});

// Pay bonuses up the chain
await rewards.pay_multi_level_referral_bonus({
  admin: adminAddress,
  campaign_contract: campaignAddress,
  referee: refereeAddress,
  qualifying_amount: 1000n,
});
```

### Issue #900: Minimum Claim Threshold

```typescript
// Set minimum claim amount
await rewards.set_min_claim({
  admin: adminAddress,
  min_amount: 100n,
});

// Claims below minimum will fail
const minClaim = await rewards.min_claim();
```

## Development

### Generate Bindings

```bash
npm run generate:contracts
```

### Build

```bash
npm run build
```

## License

Apache-2.0
